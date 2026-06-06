import express from 'express';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import {
  getAllFormConfigs,
  getFormConfig,
  upsertFormConfig,
  upsertCustomerOverride,
  deleteCustomerOverride,
} from './formConfig.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/', getAllFormConfigs);
router.get('/:formType', getFormConfig);
router.put('/:formType', checkPermission('formConfig', 'update'), upsertFormConfig);
router.put('/:formType/customer/:customerId', checkPermission('formConfig', 'update'), upsertCustomerOverride);
router.delete('/:formType/customer/:customerId', checkPermission('formConfig', 'update'), deleteCustomerOverride);

export default router;
