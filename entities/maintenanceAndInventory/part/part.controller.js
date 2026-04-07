import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Part from './part.model.js';
import PartLocation from '../partLocation/partLocation.model.js';
import PartStock from '../partStock/partStock.model.js';
import PartTransaction from '../partTransaction/partTransaction.model.js';
import { PART_SEARCH_FIELDS } from './part.constants.js';
import { addTenantToQuery } from '../../../utils/tenant-utils.js';
import { buildPublicFileUrl, createPresignedPutUrl } from '../../../services/s3.service.js';

// ─── PARTS CRUD ────────────────────────────────────────────────────────────────

import { recordInventoryActivity } from '../partTransaction/partTransaction.utils.js';
import { INVENTORY_ACTIVITY_TYPES, SOURCE_DOCUMENT_TYPES } from '../partTransaction/partTransaction.constants.js';
import PurchaseOrder from '../purchaseOrder/purchaseOrder.model.js';
import WorkOrder from '../workOrder/workOrder.model.js';
import { PURCHASE_ORDER_STATUS } from '../purchaseOrder/purchaseOrder.constants.js';
import { WORK_ORDER_STATUS } from '../workOrder/workOrder.constants.js';

// ─── PARTS CRUD ────────────────────────────────────────────────────────────────

const createPart = asyncHandler(async (req, res) => {
  const { initialInventory, inventory, inventoryLocation } = req.body;
  const inventoryData = initialInventory || inventory;

  // Guard: Ensure at least one active part location exists
  const activeLocationCount = await PartLocation.countDocuments({
    tenant: req.tenant,
    isActive: { $ne: false },
  });

  if (activeLocationCount === 0) {
    res.status(400);
    throw new Error('Cannot create parts. Please create at least one active Part Location first.');
  }

  // Guard: Check for duplicate partNumber among active parts only
  const existingPart = await Part.findOne({
    tenant: req.tenant,
    partNumber: req.body.partNumber,
    isActive: { $ne: false },
  });

  if (existingPart) {
    res.status(400);
    throw new Error(`A part with Part Number "${req.body.partNumber}" already exists.`);
  }

  const part = new Part({
    ...req.body,
    tenant: req.tenant,
    averageUnitCost: req.body.unitCost,
  });
  const newPart = await part.save();

  // Handle initial inventory creation
  // We want to ensure ALL active locations get a PartInventory record.
  // We'll merge any user-provided data (quantities/thresholds) with the full list of locations.
  const activeLocations = await PartLocation.find({
    tenant: req.tenant,
    isActive: { $ne: false },
  }).select('_id');

  const inventoryItems = activeLocations.map((loc) => {
    const locId = loc._id.toString();
    const provided = (Array.isArray(inventoryData) ? inventoryData : []).find(
      (item) => (item.inventoryLocation || item.id || '').toString() === locId
    );

    return {
      inventoryLocation: loc._id,
      quantity: provided ? Number(provided.quantity) || 0 : 0,
      threshold: provided ? Number(provided.threshold) || 0 : 0,
    };
  });

  // Also handle any specific locations provided that might not have been in activeLocations (legacy/specific)
  if (inventoryLocation) {
    const locId = inventoryLocation.toString();
    if (!inventoryItems.find((item) => item.inventoryLocation.toString() === locId)) {
      inventoryItems.push({
        inventoryLocation,
        quantity: 0,
        threshold: 0,
      });
    }
  }

  if (inventoryItems.length > 0) {
    try {
      for (const item of inventoryItems) {
        if (!item.inventoryLocation) continue;

        // Verify location exists and belongs to tenant
        const location = await PartLocation.findOne({
          _id: item.inventoryLocation,
          tenant: req.tenant
        });

        if (!location) continue;

        const quantity = Number(item.quantity) || 0;
        const threshold = Number(item.threshold) || 0;

        // Create PartStock record
        // We can use recordInventoryActivity if quantity > 0, 
        // but we also need to set the threshold which recordInventoryActivity doesn't do by default.
        // So let's create the record first.

        let partStock = new PartStock({
          tenant: req.tenant,
          part: newPart._id,
          inventoryLocation: item.inventoryLocation,
          quantity: 0, // Start at 0, then add if needed
          threshold: threshold,
        });
        await partStock.save();

        // If there is initial stock, record it as an activity
        if (quantity > 0) {
          await recordInventoryActivity({
            tenant: req.tenant,
            partId: newPart._id,
            locationId: item.inventoryLocation,
            type: INVENTORY_ACTIVITY_TYPES.INITIAL,
            direction: 'IN',
            quantityChange: quantity,
            performedBy: req.user._id,
            sourceDocumentType: SOURCE_DOCUMENT_TYPES.MANUAL,
            reason: 'Initial Stock',
            meta: { unitCost: req.body.unitCost },
          });
        }
      }
    } catch (error) {
      // If inventory creation fails, we shouldn't fail the whole request 
      // but maybe log it. The part is already created.
      console.error('Failed to create initial inventory for part:', newPart._id, error);
    }
  }

  res.status(201).json(newPart);
});

// @desc    Create bulk parts
// @route   POST /api/maintenance/parts/bulk
// @access  Private
const createBulkParts = asyncHandler(async (req, res) => {
  const { parts } = req.body;

  if (!Array.isArray(parts) || parts.length === 0) {
    res.status(400);
    throw new Error('No parts data provided');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Guard: Ensure at least one active part location exists
    const activeLocationCount = await PartLocation.countDocuments({
      tenant: req.tenant,
      isActive: { $ne: false },
    });

    if (activeLocationCount === 0) {
      res.status(400);
      throw new Error('Cannot create parts. Please create at least one active Part Location first.');
    }

    const normalizedParts = parts.map((part, index) => ({
      ...part,
      rowNumber: index + 1,
      normalizedPartNumber: String(part.partNumber).trim(),
    }));

    const duplicateRowsByPartNumber = normalizedParts.reduce((acc, part) => {
      if (!acc[part.normalizedPartNumber]) {
        acc[part.normalizedPartNumber] = [];
      }
      acc[part.normalizedPartNumber].push(part.rowNumber);
      return acc;
    }, {});

    const duplicateEntriesInFile = Object.entries(duplicateRowsByPartNumber)
      .filter(([, rows]) => rows.length > 1)
      .map(([partNumber, rows]) => `"${partNumber}" on rows ${rows.join(', ')}`);

    if (duplicateEntriesInFile.length > 0) {
      res.status(400);
      throw new Error(`Duplicate Part Numbers found in the import file: ${duplicateEntriesInFile.join('; ')}`);
    }

    // Guard: Check for duplicate partNumbers among active parts only
    const incomingPartNumbers = normalizedParts.map((p) => p.normalizedPartNumber);
    const existingActiveParts = await Part.find({
      tenant: req.tenant,
      partNumber: { $in: incomingPartNumbers },
      isActive: { $ne: false },
    }).select('partNumber');

    if (existingActiveParts.length > 0) {
      const duplicates = existingActiveParts
        .map((p) => {
          const matchingPart = normalizedParts.find((part) => part.normalizedPartNumber === p.partNumber);
          const rowLabel = matchingPart ? `row ${matchingPart.rowNumber}` : 'uploaded rows';
          return `"${p.partNumber}" (${rowLabel})`;
        })
        .join(', ');
      res.status(400);
      throw new Error(`The following Part Numbers already exist: ${duplicates}`);
    }

    const partsToInsert = [];
    const partStocksToInsert = [];
    const transactionsToInsert = [];

    for (const partData of normalizedParts) {
      const {
        partNumber,
        name,
        category,
        manufacturer,
        unitCost,
        measurementUnit,
        description,
        inventory = [],
        rowNumber,
      } = partData;

      // 1. Create the Part
      const newPart = new Part({
        _id: new mongoose.Types.ObjectId(),
        tenant: req.tenant,
        partNumber: String(partNumber),
        name: String(name),
        category: category ? String(category) : undefined,
        manufacturer: manufacturer ? String(manufacturer) : undefined,
        unitCost: Number(unitCost) || 0,
        averageUnitCost: Number(unitCost) || 0,
        measurementUnit: String(measurementUnit),
        description: description ? String(description) : undefined,
        isActive: true
      });

      partsToInsert.push(newPart);

      // 2. Insert corresponding PartStock & Inventory Activities
      if (Array.isArray(inventory) && inventory.length > 0) {
        for (const item of inventory) {
          if (!item.inventoryLocation) continue;

          const quantity = Number(item.quantity) || 0;
          const threshold = Number(item.threshold) || 0;
          const partStockId = new mongoose.Types.ObjectId();

          partStocksToInsert.push(new PartStock({
            _id: partStockId,
            tenant: req.tenant,
            part: newPart._id,
            inventoryLocation: item.inventoryLocation,
            quantity: quantity, // Start at populated quantity directly
            threshold,
          }));

          if (quantity > 0) {
            transactionsToInsert.push(new PartTransaction({
              tenant: req.tenant,
              part: newPart._id,
              inventoryLocation: item.inventoryLocation,
              partStock: partStockId,
              type: INVENTORY_ACTIVITY_TYPES.INITIAL,
              direction: 'IN',
              quantityBefore: 0,
              quantityChange: quantity,
              quantityAfter: quantity,
              performedBy: req.user._id,
              sourceDocumentType: SOURCE_DOCUMENT_TYPES.MANUAL,
              reason: 'Bulk Initial Stock',
              averageUnitCost: newPart.unitCost,
              totalCost: quantity * newPart.unitCost,
              meta: { unitCost: newPart.unitCost }
            }));
          }
        }
      }
    }

    try {
      if (partsToInsert.length > 0) {
        await Part.insertMany(partsToInsert, { session });
      }
      if (partStocksToInsert.length > 0) {
        await PartStock.insertMany(partStocksToInsert, { session });
      }
      if (transactionsToInsert.length > 0) {
        await PartTransaction.insertMany(transactionsToInsert, { session });
      }
    } catch (error) {
      if (error?.code === 11000) {
        error.message = `Part import failed. A part with this Part Number already exists.`;
      }
      throw error;
    }

    await session.commitTransaction();
    res.status(201).json(partsToInsert);
  } catch (error) {
    await session.abortTransaction();
    res.status(400); // Validation/duplicate key errors
    throw error;
  } finally {
    session.endSession();
  }
});

const fetchParts = asyncHandler(async (req, res) => {
  try {
    const { search, category, manufacturer, inventoryLocation, status } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);
    query.isActive = { $ne: false };

    if (search) {
      query.$or = PART_SEARCH_FIELDS.map((field) => ({
        [field]: { $regex: search, $options: 'i' },
      }));
    }

    if (category) {
      query.category = { $regex: category, $options: 'i' };
    }

    if (manufacturer) {
      query.manufacturer = { $regex: manufacturer, $options: 'i' };
    }

    const aggQuery = { ...query };

    // Build aggregation pipeline for inventory totals
    const pipeline = [
      { $match: aggQuery },
      {
        $lookup: {
          from: 'partstocks',
          localField: '_id',
          foreignField: 'part',
          as: 'inventories',
        },
      },
      {
        $unwind: {
          path: '$inventories',
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    if (inventoryLocation && mongoose.Types.ObjectId.isValid(inventoryLocation)) {
      pipeline.push({
        $match: {
          'inventories.inventoryLocation': new mongoose.Types.ObjectId(inventoryLocation),
        },
      });
    }

    pipeline.push({
      $group: {
        _id: '$_id',
        unitCost: { $first: '$unitCost' },
        totalQuantity: {
          $sum: {
            $ifNull: ['$inventories.quantity', 0],
          },
        },
        threshold: { $max: { $ifNull: ['$inventories.threshold', 0] } },
      },
    });

    // Compute stats BEFORE filtering by status
    const statsPipeline = [
      ...pipeline,
      {
        $group: {
          _id: null,
          totalQuantityItems: { $sum: '$totalQuantity' },
          outOfStockItems: {
            $sum: {
              $cond: [{ $lte: ['$totalQuantity', 0] }, 1, 0],
            },
          },
          lowStockItems: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ['$totalQuantity', '$threshold'] },
                    { $gt: ['$totalQuantity', 0] }
                  ]
                },
                1,
                0
              ],
            },
          },
          totalInventoryValue: {
            $sum: { $multiply: ['$totalQuantity', '$unitCost'] },
          },
          count: { $sum: 1 }
        },
      },
    ];

    // Pipeline for ids matching status filter
    const idsPipeline = [...pipeline];

    if (status && status !== 'all') {
      if (status === 'outOfStock') {
        idsPipeline.push({ $match: { totalQuantity: { $lte: 0 } } });
      } else if (status === 'lowStock') {
        idsPipeline.push({
          $match: {
            totalQuantity: { $gt: 0 },
            $expr: { $lt: ['$totalQuantity', '$threshold'] },
          },
        });
      } else if (status === 'inStock') {
        idsPipeline.push({
          $match: {
            totalQuantity: { $gt: 0 },
            $expr: { $gte: ['$totalQuantity', '$threshold'] },
          },
        });
      }
    }

    const [statsResult, matchingDocs] = await Promise.all([
      Part.aggregate(statsPipeline),
      Part.aggregate(idsPipeline),
    ]);

    const inventoryTotals = statsResult[0] || {
      totalQuantityItems: 0,
      outOfStockItems: 0,
      lowStockItems: 0,
      totalInventoryValue: 0,
      count: 0,
    };

    const matchingPartIds = matchingDocs.map((doc) => doc._id);
    const total = matchingPartIds.length;

    // Fetch the paginated parts directly using matching IDs
    const parts = await Part.find({ ...query, _id: { $in: matchingPartIds } })
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const partsWithStats = parts.map((part) => {
      const stats = matchingDocs.find(
        (d) => d._id.toString() === part._id.toString()
      );
      return {
        ...part,
        totalQuantity: stats ? stats.totalQuantity : 0,
        threshold: stats ? stats.threshold : 0,
      };
    });

    res.status(200).json({
      parts: partsWithStats,
      total,
      startRange: skip + 1,
      endRange: skip + parts.length,
      totalQuantityItems: inventoryTotals.totalQuantityItems || 0,
      outOfStockItems: inventoryTotals.outOfStockItems || 0,
      lowStockItems: inventoryTotals.lowStockItems || 0,
      count: inventoryTotals.count || 0,
      totalInventoryValue: inventoryTotals.totalInventoryValue || 0,
    });
  } catch (error) {
    res.status(500).json({
      message: 'An error occurred while fetching paginated parts',
      error: error.message,
    });
  }
});

const fetchPartById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const part = await Part.findOne({
    _id: id,
    tenant: req.tenant,
  }).lean();

  if (!part) {
    return res.status(404).json({ message: 'Part not found' });
  }

  // Fetch inventory details
  const inventory = await PartStock.find({ part: id, tenant: req.tenant })
    .populate('inventoryLocation', 'name address')
    .lean();

  res.status(200).json({ ...part, inventory });
});

const updatePart = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { inventory } = req.body;

  const part = await Part.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    req.body,
    { new: true },
  );

  if (!part) {
    return res.status(404).json({ message: 'Part not found' });
  }

  // Handle inventory threshold updates
  if (Array.isArray(inventory) && inventory.length > 0) {
    const bulkOps = inventory
      .filter(item => item.inventoryLocation) // Ensure location ID is present
      .map(item => ({
        updateOne: {
          filter: {
            tenant: req.tenant,
            part: id,
            inventoryLocation: item.inventoryLocation
          },
          update: {
            $set: {
              threshold: Number(item.threshold) || 0
            },
            // Optional: If we want to ensure the record exists even if quantity is 0
            // $setOnInsert: { quantity: 0 } 
          },
          upsert: true // Create the record if it doesn't exist (e.g. new location added to part)
        }
      }));

    if (bulkOps.length > 0) {
      await PartStock.bulkWrite(bulkOps);
    }
  }

  res.status(200).json(part);
});

const deletePart = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check for open Purchase Orders
  const openPurchaseOrder = await PurchaseOrder.findOne({
    tenant: req.tenant,
    'lines.part': id,
    status: {
      $nin: [
        PURCHASE_ORDER_STATUS.RECEIVED,
        PURCHASE_ORDER_STATUS.REJECTED,
        // If "cancelled" exists, it should be here too, but based on constants it's REJECTED or RECEIVED needed to close.
        // The user said: "purchase order can be in open status if it is not received or rejected"
      ],
    },
  });

  if (openPurchaseOrder) {
    res.status(400);
    throw new Error(
      'Part cannot be deleted as it is associated with an open Purchase Order. Please ensure all related Purchase Orders are received or rejected.'
    );
  }

  // Check for open Work Orders
  const openWorkOrder = await WorkOrder.findOne({
    tenant: req.tenant,
    'parts.part': id,
    status: {
      $nin: [WORK_ORDER_STATUS.COMPLETED],
      // The user said: "work order can be in open status if it is not completed (i.e either in open / pending)"
    },
  });

  if (openWorkOrder) {
    res.status(400);
    throw new Error(
      'Part cannot be deleted as it is associated with an open Work Order. Please ensure all related Work Orders are completed.'
    );
  }

  const part = await Part.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    { isActive: false },
    { new: true }
  );

  if (!part) {
    return res.status(404).json({ message: 'Part not found' });
  }

  res.status(200).json({ message: 'Part deleted successfully (soft delete)', id: part._id });
});

const getPartPriceHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Fetch the part to get its initial pricing context
  const part = await Part.findOne({ _id: id, tenant: req.tenant }).lean();
  if (!part) {
    return res.status(404).json({ message: 'Part not found' });
  }

  // 2. Fetch relevant transactions (Purchase Receipts and Initial Stock)
  const transactions = await PartTransaction.find({
    part: id,
    tenant: req.tenant,
    type: { $in: [INVENTORY_ACTIVITY_TYPES.PURCHASE_RECEIPT, INVENTORY_ACTIVITY_TYPES.INITIAL] },
  })
    .sort({ createdAt: 1 })
    .lean();

  // 3. Manually populate Purchase Orders since sourceDocumentId lacks a ref in schema
  const poIds = transactions
    .filter(tx => tx.type === INVENTORY_ACTIVITY_TYPES.PURCHASE_RECEIPT && tx.sourceDocumentId)
    .map(tx => tx.sourceDocumentId);

  const purchaseOrders = await PurchaseOrder.find({
    _id: { $in: poIds },
    tenant: req.tenant
  }).lean();

  // 4. Map transactions to history format
  const history = transactions.map((tx) => {
    if (tx.type === INVENTORY_ACTIVITY_TYPES.INITIAL) {
      return {
        date: tx.createdAt,
        price: tx.meta?.unitCost || part.unitCost || 0, // Fallback to part's unitCost
        quantity: tx.quantityChange,
        vendor: 'Initial Stock',
        type: 'initial'
      };
    }

    if (tx.type === INVENTORY_ACTIVITY_TYPES.PURCHASE_RECEIPT) {
      const po = purchaseOrders.find(p => p._id.toString() === (tx.sourceDocumentId || '').toString());
      if (!po || !po.lines) return null;

      const line = po.lines.find(
        (l) => l._id.toString() === (tx.sourceDocumentLineId || '').toString()
      );

      if (!line) return null;

      return {
        date: tx.createdAt,
        price: line.unitCost,
        quantity: tx.quantityChange,
        vendor: po.vendorSnapshot?.name || 'Unknown Vendor',
        type: 'purchase'
      };
    }

    return null;
  }).filter(Boolean);

  res.status(200).json(history);
});

// GET presigned URL for part photo upload
const getPhotoUploadUrl = asyncHandler(async (req, res) => {
  const { contentType, fileExtension } = req.query;

  if (!contentType || !fileExtension) {
    res.status(400);
    throw new Error('contentType and fileExtension are required');
  }

  const tenantStr = String(req.tenant);

  // e.g. logos/parts/5f8f8.../photos/part_1640995200000_1234.jpg
  const timestamp = Date.now();
  const rand = Math.floor(Math.random() * 10000);

  // Notice we prepend 'logos/' to the key. This is because the Cloudfront 
  // distribution for this application has an Origin Path set to '/logos'.
  // Thus, S3 must physically store the files inside the 'logos/' directory
  // for Cloudfront to be able to serve them.
  const s3Key = `logos/parts/${tenantStr}/photos/part_${timestamp}_${rand}.${fileExtension}`;

  try {
    const uploadUrl = await createPresignedPutUrl({ key: s3Key, contentType, expiresIn: 900 });

    // For the public URL, we omit the 'logos/' prefix, because Cloudfront
    // automatically prefixes its requests to the S3 bucket with '/logos'.
    const base = process.env.AWS_PUBLIC_BASE_URL;
    const publicKey = s3Key.replace(/^logos\//, '');
    const publicUrl = base
      ? `${base.replace(/\/$/, '')}/${publicKey}`
      : (buildPublicFileUrl(s3Key) || null);

    return res.status(200).json({ key: s3Key, uploadUrl, publicUrl });
  } catch (err) {
    console.error('Failed to create part photo upload url:', err);
    return res.status(500).json({ message: 'Failed to create upload URL', error: err.message });
  }
});

// @desc    Export parts to Excel
// @route   GET /api/maintenance/parts/export
// @access  Private
const exportParts = asyncHandler(async (req, res) => {
  const { search, category, manufacturer, inventoryLocation, columns } = req.query;

  const query = addTenantToQuery(req);
  query.isActive = { $ne: false };

  if (search) {
    query.$or = PART_SEARCH_FIELDS.map((field) => ({
      [field]: { $regex: search, $options: 'i' },
    }));
  }

  if (category) {
    query.category = { $regex: category, $options: 'i' };
  }

  if (manufacturer) {
    query.manufacturer = { $regex: manufacturer, $options: 'i' };
  }

  const aggQuery = { ...query };

  const inventoryTotalsPipeline = [
    { $match: aggQuery },
    {
      $lookup: {
        from: 'partstocks',
        localField: '_id',
        foreignField: 'part',
        as: 'inventories',
      },
    },
    {
      $unwind: {
        path: '$inventories',
        preserveNullAndEmptyArrays: true,
      },
    },
  ];

  if (inventoryLocation && mongoose.Types.ObjectId.isValid(inventoryLocation)) {
    inventoryTotalsPipeline.push({
      $match: {
        'inventories.inventoryLocation': new mongoose.Types.ObjectId(inventoryLocation),
      },
    });
  }

  inventoryTotalsPipeline.push({
    $group: {
      _id: '$_id',
      unitCost: { $first: '$unitCost' },
      totalQuantity: {
        $sum: {
          $ifNull: ['$inventories.quantity', 0],
        },
      },
      threshold: { $max: '$inventories.threshold' },
    },
  });

  const [parts, inventoryTotalsAgg] = await Promise.all([
    Part.find(query).sort({ name: 1 }).lean(),
    Part.aggregate(inventoryTotalsPipeline),
  ]);

  const partsWithStats = parts.map(part => {
    const stats = inventoryTotalsAgg.find(s => s._id.toString() === part._id.toString());
    return {
      ...part,
      totalQuantity: stats ? stats.totalQuantity : 0,
      threshold: stats ? stats.threshold : 0,
    };
  });

  const COLUMN_MAPPING = {
    name: { header: 'Part Name', key: 'name', width: 25 },
    partNumber: { header: 'Part Number', key: 'partNumber', width: 20 },
    category: { header: 'Category', key: 'category', width: 20 },
    manufacturer: { header: 'Manufacturer', key: 'manufacturer', width: 20 },
    quantity: { header: 'Quantity', key: 'quantity', width: 15 },
    measurementUnit: { header: 'Unit', key: 'measurementUnit', width: 15 },
    unitCost: { header: 'Unit Cost', key: 'unitCost', width: 15 },
    totalCost: { header: 'Total Cost', key: 'totalCost', width: 15 },
    description: { header: 'Description', key: 'description', width: 40 },
  };

  let exportColumns = [];
  if (columns) {
    const columnIds = columns.split(',');
    exportColumns = columnIds
      .map((id) => COLUMN_MAPPING[id])
      .filter((col) => col);
  }

  if (exportColumns.length === 0) {
    exportColumns = Object.values(COLUMN_MAPPING);
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=Parts.xlsx"
  );

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
  });

  const worksheet = workbook.addWorksheet('Parts');
  worksheet.columns = exportColumns;

  let grandTotalCost = 0;

  for (const part of partsWithStats) {
    const row = {};
    const cost = part.averageUnitCost || part.unitCost || 0;
    const qty = part.totalQuantity || 0;
    const totalCost = qty * cost;

    grandTotalCost += totalCost;

    exportColumns.forEach((col) => {
      const key = col.key;
      if (key === 'quantity') {
        row[key] = qty;
      } else if (key === 'totalCost') {
        row[key] = totalCost;
      } else if (key === 'unitCost') {
        row[key] = cost;
      } else {
        row[key] = (part[key] !== undefined && part[key] !== null) ? part[key] : '-';
      }
    });

    worksheet.addRow(row).commit();
  }

  // Footer Row
  const totalRow = {};
  exportColumns.forEach((col) => {
    const key = col.key;
    if (key === 'name') totalRow[key] = 'TOTAL';
    else if (key === 'totalCost') totalRow[key] = Math.round(grandTotalCost * 100) / 100;
    else totalRow[key] = '';
  });

  const footerRow = worksheet.addRow(totalRow);
  footerRow.font = { bold: true };
  footerRow.commit();

  worksheet.commit();
  await workbook.commit();
});

export {
  createPart,
  createBulkParts,
  fetchParts,
  exportParts,
  fetchPartById,
  updatePart,
  deletePart,
  getPartPriceHistory,
  getPhotoUploadUrl,
};
