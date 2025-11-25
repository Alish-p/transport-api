import asyncHandler from 'express-async-handler';
import Vendor from './vendor.model.js';
import { VENDOR_SEARCH_FIELDS } from './vendor.constants.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';

// Create Vendor
const createVendor = asyncHandler(async (req, res) => {
  const vendor = new Vendor({ ...req.body, tenant: req.tenant });
  const newVendor = await vendor.save();

  res.status(201).json(newVendor);
});

// Fetch Vendor by ID
const fetchVendorById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const vendor = await Vendor.findOne({ _id: id, tenant: req.tenant });

  if (!vendor) {
    return res.status(404).json({ message: 'Vendor not found' });
  }

  res.status(200).json(vendor);
});

// Fetch Vendors with pagination and search
const fetchVendors = asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (search) {
      query.$or = VENDOR_SEARCH_FIELDS.map((field) => ({
        [field]: { $regex: search, $options: 'i' },
      }));
    }

    const [vendors, total] = await Promise.all([
      Vendor.find(query).sort({ name: 1 }).skip(skip).limit(limit),
      Vendor.countDocuments(query),
    ]);

    res.status(200).json({
      vendors,
      total,
      startRange: skip + 1,
      endRange: skip + vendors.length,
    });
  } catch (error) {
    res.status(500).json({
      message: 'An error occurred while fetching paginated vendors',
      error: error.message,
    });
  }
});

// Update Vendor
const updateVendor = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const vendor = await Vendor.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    req.body,
    { new: true },
  );

  if (!vendor) {
    return res.status(404).json({ message: 'Vendor not found' });
  }

  res.status(200).json(vendor);
});

// Delete Vendor
const deleteVendor = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const vendor = await Vendor.findOneAndDelete({ _id: id, tenant: req.tenant });

  if (!vendor) {
    return res.status(404).json({ message: 'Vendor not found' });
  }

  res.status(200).json(vendor);
});

export {
  createVendor,
  fetchVendors,
  fetchVendorById,
  updateVendor,
  deleteVendor,
};

