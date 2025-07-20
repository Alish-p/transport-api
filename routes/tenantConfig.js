const { Router } = require('express');
const {
  getTenantConfig,
  updateTenantConfig,
} = require('../controllers/tenantConfig');
const { private, checkPermission } = require('../middlewares/Auth');

const router = Router();

router.get('/', private, checkPermission('tenant', 'view'), getTenantConfig);
router.put('/', private, checkPermission('tenant', 'update'), updateTenantConfig);

module.exports = router;
