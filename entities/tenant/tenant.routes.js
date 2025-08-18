import { Router } from 'express';
import {
  createTenant,
  fetchTenants,
  fetchTenantById,
  updateTenant,
} from './tenant.controller.js';
import { tenantSchema } from './tenant.validation.js';
import validateZod from '../../middlewares/validate.js';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.post('/', validateZod(tenantSchema), createTenant);
router.get(
  '/mytenant',
  authenticate,
  checkPermission('tenant', 'view'),
  fetchTenantById,
);
router.get(
  '/',
  authenticate,
  checkPermission('tenant', 'view'),
  pagination,
  fetchTenants,
);

router.put(
  '/mytenant',
  authenticate,
  checkPermission('tenant', 'update'),
  validateZod(tenantSchema),
  updateTenant,
);
// Delete operation is disabled for tenants

export default router;
