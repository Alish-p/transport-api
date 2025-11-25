import asyncHandler from 'express-async-handler';
import Part from './part.model.js';
import PartLocation from './partLocation.model.js';
import { PART_SEARCH_FIELDS, PART_LOCATION_SEARCH_FIELDS } from './part.constants.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';

// ─── PARTS CRUD ────────────────────────────────────────────────────────────────

const createPart = asyncHandler(async (req, res) => {
  const { inventoryLocation } = req.body;

  // Ensure referenced location belongs to the same tenant
  const location = await PartLocation.findOne({
    _id: inventoryLocation,
    tenant: req.tenant,
  });

  if (!location) {
    return res.status(400).json({ message: 'Invalid inventory location' });
  }

  const part = new Part({ ...req.body, tenant: req.tenant });
  const newPart = await part.save();

  res.status(201).json(newPart);
});

const fetchParts = asyncHandler(async (req, res) => {
  try {
    const { search, category, inventoryLocation, manufacturer } = req.query;
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

    if (inventoryLocation) {
      query.inventoryLocation = inventoryLocation;
    }

    const [parts, total] = await Promise.all([
      Part.find(query)
        .populate('inventoryLocation', 'name address')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      Part.countDocuments(query),
    ]);

    res.status(200).json({
      parts,
      total,
      startRange: skip + 1,
      endRange: skip + parts.length,
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
  }).populate('inventoryLocation', 'name address');

  if (!part) {
    return res.status(404).json({ message: 'Part not found' });
  }

  res.status(200).json(part);
});

const updatePart = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (req.body.inventoryLocation) {
    const location = await PartLocation.findOne({
      _id: req.body.inventoryLocation,
      tenant: req.tenant,
    });

    if (!location) {
      return res.status(400).json({ message: 'Invalid inventory location' });
    }
  }

  const part = await Part.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    req.body,
    { new: true },
  );

  if (!part) {
    return res.status(404).json({ message: 'Part not found' });
  }

  res.status(200).json(part);
});

const deletePart = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const part = await Part.findOneAndDelete({
    _id: id,
    tenant: req.tenant,
  });

  if (!part) {
    return res.status(404).json({ message: 'Part not found' });
  }

  res.status(200).json(part);
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
};

