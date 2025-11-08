import { Router } from 'express';
import {
  createTenant,
  fetchTenants,
  fetchTenantById,
  updateTenant,
  getLogoUploadUrl,
  setTenantLogo,
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

// Branding: tenant logo
router.get(
  '/branding/logo/upload-url',
  authenticate,
  checkPermission('tenant', 'update'),
  getLogoUploadUrl,
);

router.put(
  '/branding/logo',
  authenticate,
  checkPermission('tenant', 'update'),
  setTenantLogo,
);
// Delete operation is disabled for tenants

export default router;
