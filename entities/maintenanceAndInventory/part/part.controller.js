import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Part from './part.model.js';
import PartLocation from '../partLocation/partLocation.model.js';
import PartStock from '../partStock/partStock.model.js';
import PartTransaction from '../partTransaction/partTransaction.model.js';
import { PART_SEARCH_FIELDS } from './part.constants.js';
import { addTenantToQuery } from '../../../utils/tenant-utils.js';

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

const fetchParts = asyncHandler(async (req, res) => {
  try {
    const { search, category, manufacturer, inventoryLocation } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);
    query.isActive = { $ne: false };

    if (search) {
      query.$or = PART_SEARCH_FIELDS.map((field) => ({
        [field]: { $regex: search, $options: 'i' },
      }));
    }

    if (category) {
      query.category = category;
    }

    if (manufacturer) {
      query.manufacturer = { $regex: manufacturer, $options: 'i' };
    }

    // Clone query for aggregations (Mongoose does not auto-cast inside $match)
    const aggQuery = { ...query };

    // Build aggregation pipeline for inventory totals (respecting filters)
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

    inventoryTotalsPipeline.push(
      {
        $group: {
          _id: '$_id',
          unitCost: { $first: '$unitCost' },
          totalQuantity: {
            $sum: {
              $ifNull: ['$inventories.quantity', 0],
            },
          },
          // If filtered by location, we have a unique threshold. 
          // If not, this might be ambiguous, but taking max or sum is a heuristic.
          // Usually threshold is per location.
          threshold: { $max: '$inventories.threshold' },
        },
      },
      {
        $group: {
          _id: null,
          totalQuantityItems: { $sum: '$totalQuantity' },
          outOfStockItems: {
            $sum: {
              $cond: [{ $eq: ['$totalQuantity', 0] }, 1, 0],
            },
          },
          lowStockItems: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ['$totalQuantity', '$threshold'] },
                    // Optional: Exclude out of stock from low stock if desired. 
                    // But "Low Stock" usually implies attention needed.
                    // The user asked for "Out of stock items, low stock items and all".
                    // Let's treat them as overlapping sets unless specified.
                    // A part with 0 quantity and threshold 5 is BOTH Out of Stock AND Low Stock.
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
        },
      },
    );

    // Fetch parts with pagination
    const [parts, total, inventoryTotalsAgg] = await Promise.all([
      Part.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Part.countDocuments(query),
      Part.aggregate(inventoryTotalsPipeline),
    ]);

    // Fetch inventory summary for these parts
    const partIds = parts.map(p => p._id);
    const inventoryMatch = {
      part: { $in: partIds },
      tenant: req.tenant,
    };

    if (inventoryLocation && mongoose.Types.ObjectId.isValid(inventoryLocation)) {
      inventoryMatch.inventoryLocation = new mongoose.Types.ObjectId(inventoryLocation);
    }

    const inventoryStats = await PartStock.aggregate([
      { $match: inventoryMatch },
      {
        $group: {
          _id: '$part',
          totalQuantity: { $sum: '$quantity' },
          threshold: { $max: '$threshold' },
          locations: { $addToSet: '$inventoryLocation' } // Just to know how many locations
        }
      }
    ]);

    const inventoryTotals =
      inventoryTotalsAgg[0] || {
        totalQuantityItems: 0,
        outOfStockItems: 0,
        lowStockItems: 0,
        totalInventoryValue: 0,
      };

    // Map stats back to parts
    const partsWithStats = parts.map(part => {
      const stats = inventoryStats.find(s => s._id.toString() === part._id.toString());
      return {
        ...part,
        totalQuantity: stats ? stats.totalQuantity : 0,
        threshold: stats ? stats.threshold : 0,
        locationCount: stats ? stats.locations.length : 0
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

export {
  createPart,
  fetchParts,
  fetchPartById,
  updatePart,
  deletePart,
  getPartPriceHistory,
};
