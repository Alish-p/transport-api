const asyncHandler = require('express-async-handler');
const TenantConfig = require('../model/TenantConfig');

// Get current tenant config
const getTenantConfig = asyncHandler(async (req, res) => {
  const config = await TenantConfig.findOne({ tenant: req.tenant });
  if (!config) {
    return res.status(404).json({ message: 'Tenant config not found' });
  }
  res.json(config);
});

// Update tenant config
const updateTenantConfig = asyncHandler(async (req, res) => {
  const config = await TenantConfig.findOneAndUpdate(
    { tenant: req.tenant },
    req.body,
    { new: true }
  );
  if (!config) {
    return res.status(404).json({ message: 'Tenant config not found' });
  }
  res.json(config);
});

module.exports = {
  getTenantConfig,
  updateTenantConfig,
};
