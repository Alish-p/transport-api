import express from 'express';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import { getFieldConfig, upsertFieldConfig, upsertCustomerOverride, deleteCustomerOverride } from './fieldConfig.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/:entity', getFieldConfig);
router.put('/:entity', checkPermission('fieldConfig', 'update'), upsertFieldConfig);
router.put('/:entity/customer/:customerId', checkPermission('fieldConfig', 'update'), upsertCustomerOverride);
router.delete('/:entity/customer/:customerId', checkPermission('fieldConfig', 'update'), deleteCustomerOverride);

export default router;
