const asyncHandler = require("express-async-handler");
const Tenant = require("../model/Tenant");

// Create Tenant
const createTenant = asyncHandler(async (req, res) => {
  const tenant = new Tenant({ ...req.body });
  const newTenant = await tenant.save();
  res.status(201).json(newTenant);
});

// Fetch Tenants with pagination and search
const fetchTenants = asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;
    const { limit, skip } = req.pagination;

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
      ];
    }

    const [tenants, total] = await Promise.all([
      Tenant.find(query).sort({ name: 1 }).skip(skip).limit(limit),
      Tenant.countDocuments(query),
    ]);

    res.status(200).json({
      tenants,
      total,
      startRange: skip + 1,
      endRange: skip + tenants.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching paginated tenants",
      error: error.message,
    });
  }
});

// Fetch Tenant by ID
const fetchTenantById = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.tenant);

  if (!tenant) {
    res.status(404).json({ message: "Tenant not found" });
    return;
  }

  res.status(200).json(tenant);
});

// Update Tenant
const updateTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findByIdAndUpdate(req.tenant, req.body, {
    new: true,
  });
  res.status(200).json(tenant);
});

// Delete Tenant
const deleteTenant = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenant = await Tenant.findByIdAndDelete(id);
  res.status(200).json(tenant);
});

module.exports = {
  createTenant,
  fetchTenants,
  fetchTenantById,
  updateTenant,
  deleteTenant,
};
