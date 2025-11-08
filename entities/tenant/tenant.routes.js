import { Router } from 'express';
import {
  fetchTenantById,
  updateTenant,
  getLogoUploadUrl,
  setTenantLogo,
} from './tenant.controller.js';
// Superuser-only tenant actions have moved under /api/super routes.
import { tenantSchema } from './tenant.validation.js';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

// Note: Superuser-only tenant management routes moved to /api/super
router.get(
  '/mytenant',
  authenticate,
  fetchTenantById,
);
// Tenant-scoped listing is not available here; super list moved to /api/super

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

// All payment history and super-only details moved to /api/super

export default router;
