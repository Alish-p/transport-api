import { Router } from 'express';
import validateZod from '../../middlewares/validate.js';
import { customerSchema } from './customer.validation.js';
import {
  createCustomer,
  fetchCustomers,
  fetchCustomer,
  updateCustomer,
  deleteCustomer,
  fetchCustomersSummary,
  getCustomerMonthlyMaterialWeight,
  getCustomerSubtripMonthlyData,
  getCustomerRoutes,
  getCustomerInvoiceAmountSummary,
  getCustomerInvoices,
} from './customer.controller.js';

import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.post(
  "/",
  authenticate,
  checkPermission("customer", "create"),
  validateZod(customerSchema),
  createCustomer
);
router.get("/", authenticate, pagination, fetchCustomers);
router.get("/summary", authenticate, fetchCustomersSummary);

router.get(
  "/:id/monthly-material-weight",
  authenticate,
  getCustomerMonthlyMaterialWeight
);

router.get("/:id/subtrip-monthly-data", authenticate, getCustomerSubtripMonthlyData);

router.get("/:id/routes", authenticate, getCustomerRoutes);

router.get("/:id/invoices", authenticate, getCustomerInvoices);

router.get(
  "/:id/invoice-amount-summary",
  authenticate,
  getCustomerInvoiceAmountSummary
);

router.get("/:id", authenticate, fetchCustomer);
router.put(
  "/:id",
  authenticate,
  checkPermission("customer", "update"),
  updateCustomer
);
router.delete(
  "/:id",
  authenticate,
  checkPermission("customer", "delete"),
  deleteCustomer
);

export default router;
