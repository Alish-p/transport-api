import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Part from './part.model.js';
import PartLocation from './partLocation.model.js';
import PartInventory from './partInventory.model.js';
import { PART_SEARCH_FIELDS, PART_LOCATION_SEARCH_FIELDS } from './part.constants.js';
import { addTenantToQuery } from '../../../utils/tenant-utils.js';

// ─── PARTS CRUD ────────────────────────────────────────────────────────────────

import { recordInventoryActivity } from './inventory.utils.js';
import InventoryActivity, {
  INVENTORY_ACTIVITY_TYPES,
  SOURCE_DOCUMENT_TYPES,
} from './inventoryActivity.model.js';
import PurchaseOrder from '../purchaseOrder/purchaseOrder.model.js';
import WorkOrder from '../workOrder/workOrder.model.js';

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

        // Create PartInventory record
        // We can use recordInventoryActivity if quantity > 0, 
        // but we also need to set the threshold which recordInventoryActivity doesn't do by default.
        // So let's create the record first.

        let partInventory = new PartInventory({
          tenant: req.tenant,
          part: newPart._id,
          inventoryLocation: item.inventoryLocation,
          quantity: 0, // Start at 0, then add if needed
          threshold: threshold,
          averageUnitCost: newPart.unitCost,
        });
        await partInventory.save();

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
          from: 'partinventories',
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

    const inventoryStats = await PartInventory.aggregate([
      { $match: inventoryMatch },
      {
        $group: {
          _id: '$part',
          totalQuantity: { $sum: '$quantity' },
          locations: { $addToSet: '$inventoryLocation' } // Just to know how many locations
        }
      }
    ]);

    const inventoryTotals =
      inventoryTotalsAgg[0] || {
        totalQuantityItems: 0,
        outOfStockItems: 0,
        totalInventoryValue: 0,
      };

    // Map stats back to parts
    const partsWithStats = parts.map(part => {
      const stats = inventoryStats.find(s => s._id.toString() === part._id.toString());
      return {
        ...part,
        totalQuantity: stats ? stats.totalQuantity : 0,
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
  const inventory = await PartInventory.find({ part: id, tenant: req.tenant })
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
      await PartInventory.bulkWrite(bulkOps);
    }
  }

  res.status(200).json(part);
});

const deletePart = asyncHandler(async (req, res) => {
  const { id } = req.params;

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

const adjustStock = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { inventoryLocation, quantityChange, reason, } = req.body;

  if (!inventoryLocation || quantityChange === undefined) {
    return res.status(400).json({ message: 'inventoryLocation and quantityChange are required' });
  }

  const part = await Part.findOne({ _id: id, tenant: req.tenant });
  if (!part) {
    return res.status(404).json({ message: 'Part not found' });
  }

  const location = await PartLocation.findOne({ _id: inventoryLocation, tenant: req.tenant });
  if (!location) {
    return res.status(404).json({ message: 'Location not found' });
  }

  const change = Number(quantityChange);
  if (isNaN(change)) {
    return res.status(400).json({ message: 'Invalid quantityChange' });
  }

  const activityType = INVENTORY_ACTIVITY_TYPES.MANUAL_ADJUSTMENT;
  const direction = change >= 0 ? 'IN' : 'OUT';

  try {
    const { partInventory } = await recordInventoryActivity({
      tenant: req.tenant,
      partId: id,
      locationId: inventoryLocation,
      type: activityType,
      direction,
      quantityChange: change,
      performedBy: req.user._id,
      sourceDocumentType: SOURCE_DOCUMENT_TYPES.MANUAL,
      reason: reason || 'Manual Adjustment',
    });

    res.status(200).json(partInventory);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

const transferStock = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { fromLocationId, toLocationId, quantity, reason } = req.body;

  if (!fromLocationId || !toLocationId || quantity === undefined) {
    return res.status(400).json({ message: 'fromLocationId, toLocationId, and quantity are required' });
  }

  if (fromLocationId === toLocationId) {
    return res.status(400).json({ message: 'Source and destination locations must be different' });
  }

  const qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ message: 'Quantity must be a positive number' });
  }

  const part = await Part.findOne({ _id: id, tenant: req.tenant });
  if (!part) {
    return res.status(404).json({ message: 'Part not found' });
  }

  // Verify locations
  const [sourceLoc, destLoc] = await Promise.all([
    PartLocation.findOne({ _id: fromLocationId, tenant: req.tenant }),
    PartLocation.findOne({ _id: toLocationId, tenant: req.tenant }),
  ]);

  if (!sourceLoc) return res.status(404).json({ message: 'Source location not found' });
  if (!destLoc) return res.status(404).json({ message: 'Destination location not found' });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Deduct from source
    await recordInventoryActivity(
      {
        tenant: req.tenant,
        partId: id,
        locationId: fromLocationId,
        type: INVENTORY_ACTIVITY_TYPES.TRANSFER_OUT,
        direction: 'OUT',
        quantityChange: -qty,
        performedBy: req.user._id,
        sourceDocumentType: SOURCE_DOCUMENT_TYPES.TRANSFER,
        reason: reason || 'Stock Transfer',
        meta: { toLocationId, toLocationName: destLoc.name },
      },
      session
    );

    // 2. Add to destination
    await recordInventoryActivity(
      {
        tenant: req.tenant,
        partId: id,
        locationId: toLocationId,
        type: INVENTORY_ACTIVITY_TYPES.TRANSFER_IN,
        direction: 'IN',
        quantityChange: qty,
        performedBy: req.user._id,
        sourceDocumentType: SOURCE_DOCUMENT_TYPES.TRANSFER,
        reason: reason || 'Stock Transfer',
        meta: { fromLocationId, fromLocationName: sourceLoc.name },
      },
      session
    );

    await session.commitTransaction();
    res.status(200).json({ message: 'Stock transferred successfully' });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

const fetchInventoryActivities = asyncHandler(async (req, res) => {
  try {
    const {
      fromDate,
      toDate,
      part,
      inventoryLocation,
      type,
      performedBy,
    } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    if (part) {
      query.part = part;
    }

    if (inventoryLocation) {
      query.inventoryLocation = inventoryLocation;
    }

    if (type) {
      query.type = type;
    }

    if (performedBy) {
      query.performedBy = performedBy;
    }

    const [activities, total] = await Promise.all([
      InventoryActivity.find(query)
        .populate('part', 'partNumber name')
        .populate('inventoryLocation', 'name')
        .populate('performedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      InventoryActivity.countDocuments(query),
    ]);

    res.status(200).json({
      activities,
      total,
      startRange: skip + 1,
      endRange: skip + activities.length,
    });
  } catch (error) {
    res.status(500).json({
      message: 'An error occurred while fetching inventory activities',
      error: error.message,
    });
  }
});

// ─── PART LOCATIONS CRUD ──────────────────────────────────────────────────────

const createPartLocation = asyncHandler(async (req, res) => {
  const partLocation = new PartLocation({ ...req.body, tenant: req.tenant });
  const newLocation = await partLocation.save();

  res.status(201).json(newLocation);
});

const fetchPartLocations = asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);
    query.isActive = { $ne: false };

    if (search) {
      query.$or = PART_LOCATION_SEARCH_FIELDS.map((field) => ({
        [field]: { $regex: search, $options: 'i' },
      }));
    }

    const [locations, total] = await Promise.all([
      PartLocation.find(query).sort({ name: 1 }).skip(skip).limit(limit),
      PartLocation.countDocuments(query),
    ]);

    res.status(200).json({
      locations,
      total,
      startRange: skip + 1,
      endRange: skip + locations.length,
    });
  } catch (error) {
    res.status(500).json({
      message: 'An error occurred while fetching paginated part locations',
      error: error.message,
    });
  }
});

const fetchPartLocationById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const location = await PartLocation.findOne({
    _id: id,
    tenant: req.tenant,
  });

  if (!location) {
    return res.status(404).json({ message: 'Part location not found' });
  }

  res.status(200).json(location);
});

const updatePartLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const location = await PartLocation.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    req.body,
    { new: true },
  );

  if (!location) {
    return res.status(404).json({ message: 'Part location not found' });
  }

  res.status(200).json(location);
});

const deletePartLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const location = await PartLocation.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    { isActive: false },
    { new: true }
  );

  if (!location) {
    return res.status(404).json({ message: 'Part location not found' });
  }

  res.status(200).json(location);
});

const checkPartPrice = asyncHandler(async (req, res) => {
  const { partId, locationId } = req.query;

  if (!partId) {
    return res.status(400).json({ message: 'partId is required' });
  }

  const part = await Part.findOne({ _id: partId, tenant: req.tenant });
  if (!part) {
    return res.status(404).json({ message: 'Part not found' });
  }

  let price = part.averageUnitCost || part.unitCost || 0;

  if (locationId) {
    const inventory = await PartInventory.findOne({
      part: partId,
      inventoryLocation: locationId,
      tenant: req.tenant,
    });
    if (inventory && inventory.averageUnitCost > 0) {
      price = inventory.averageUnitCost;
    }
  }

  res.status(200).json({ unitCost: price });
});

export {
  createPart,
  fetchParts,
  fetchPartById,
  updatePart,
  deletePart,
  createPartLocation,
  fetchPartLocations,
  fetchPartLocationById,
  updatePartLocation,
  deletePartLocation,
  adjustStock,
  transferStock,
  fetchInventoryActivities,
  checkPartPrice,
};
