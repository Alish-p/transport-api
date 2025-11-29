import asyncHandler from 'express-async-handler';
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

// ─── PARTS CRUD ────────────────────────────────────────────────────────────────

const createPart = asyncHandler(async (req, res) => {
  const { initialInventory, inventoryLocation } = req.body;

  const part = new Part({ ...req.body, tenant: req.tenant });
  const newPart = await part.save();

  // Handle initial inventory creation
  const inventoryItems = [];

  // Case 1: Array of inventory settings provided
  if (Array.isArray(initialInventory) && initialInventory.length > 0) {
    inventoryItems.push(...initialInventory);
  }
  // Case 2: Legacy/Simple mode - single location provided
  else if (inventoryLocation) {
    inventoryItems.push({
      inventoryLocation,
      quantity: 0,
      threshold: 0
    });
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
          threshold: threshold
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
    const { search, category, manufacturer } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

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

    // Fetch parts with pagination
    const [parts, total] = await Promise.all([
      Part.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Part.countDocuments(query),
    ]);

    // Fetch inventory summary for these parts
    const partIds = parts.map(p => p._id);
    const inventoryStats = await PartInventory.aggregate([
      { $match: { part: { $in: partIds }, tenant: req.tenant } },
      {
        $group: {
          _id: '$part',
          totalQuantity: { $sum: '$quantity' },
          locations: { $addToSet: '$inventoryLocation' } // Just to know how many locations
        }
      }
    ]);

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
      totalQuantityItems: 0,
      outOfStockItems: 0,
      totalInventoryValue: 0,
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

  // Check if there is any stock? 
  // For now, just delete the master part. 
  // Ideally we should check if it's used in POs/WOs or has stock.

  const part = await Part.findOneAndDelete({
    _id: id,
    tenant: req.tenant,
  });

  if (!part) {
    return res.status(404).json({ message: 'Part not found' });
  }

  // Cleanup inventory records?
  // await PartInventory.deleteMany({ part: id, tenant: req.tenant });

  res.status(200).json(part);
});

const adjustStock = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { inventoryLocation, quantityChange, reason, type } = req.body;

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

  const activityType = type || INVENTORY_ACTIVITY_TYPES.MANUAL_ADJUSTMENT;
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

  const location = await PartLocation.findOneAndDelete({
    _id: id,
    tenant: req.tenant,
  });

  if (!location) {
    return res.status(404).json({ message: 'Part location not found' });
  }

  res.status(200).json(location);
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
  fetchInventoryActivities,
};
