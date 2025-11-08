import { Router } from 'express';
import { authenticate, requireSuperuser } from '../../middlewares/Auth.js';
import {
  createUserForTenant,
  createTenant,
  fetchTenants,
  deleteTenant,
  addTenantPayment,
  updateTenantPayment,
  deleteTenantPayment,
  fetchTenantDetails,
} from './superuser.controller.js';

const router = Router();

// Superuser: Create a user in the given tenant with full permissions
// POST /api/super/tenants/:tenantId/users
router.post('/tenants/:tenantId/users', authenticate, requireSuperuser, createUserForTenant);

// Move superuser-only tenant routes here to centralize super logic
router.post('/tenants', authenticate, requireSuperuser, createTenant);
router.get('/tenants', authenticate, requireSuperuser, fetchTenants);
router.delete('/tenants/:id', authenticate, requireSuperuser, deleteTenant);
router.get('/tenants/:id', authenticate, requireSuperuser, fetchTenantDetails);

// Payment history management (superuser)
router.post('/tenants/:id/payments', authenticate, requireSuperuser, addTenantPayment);
router.put('/tenants/:id/payments/:paymentId', authenticate, requireSuperuser, updateTenantPayment);
router.delete('/tenants/:id/payments/:paymentId', authenticate, requireSuperuser, deleteTenantPayment);

export default router;
