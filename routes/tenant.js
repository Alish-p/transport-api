import { Router } from 'express';
import { createTenant,
  fetchTenants,
  fetchTenantById,
  updateTenant, } from '../controllers/tenant.js';

import { authenticate, checkPermission } from '../middlewares/Auth.js';
import pagination from '../middlewares/pagination.js';

const router = Router();

router.post("/", createTenant);
router.get(
  "/mytenant",
  authenticate,
  checkPermission("tenant", "view"),
  fetchTenantById
);
router.get(
  "/",
  authenticate,
  checkPermission("tenant", "view"),
  pagination,
  fetchTenants
);

router.put(
  "/mytenant",
  authenticate,
  checkPermission("tenant", "update"),
  updateTenant
);
// Delete operation is disabled for tenants

export default router;
