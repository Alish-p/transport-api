import { Router } from 'express';
import {
  createTenant,
  fetchTenants,
  fetchTenantById,
  updateTenant,
} from './tenant.controller.js';
import { tenantSchema } from './tenant.validation.js';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.post('/', createTenant);
router.get(
  '/mytenant',
  authenticate,
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
  updateTenant,
);
// Delete operation is disabled for tenants

export default router;
