import { Router } from 'express';
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
  getCustomerInvoiceAmountSummary,
  searchCustomer,
} from './customer.controller.js';

import { authenticate, checkPermission } from '../../middlewares/auth.js';
import pagination from '../../middlewares/pagination.js';
import { gstLookup } from './customer.controller.js';

const router = Router();

router.post(
  "/",
  authenticate,
  checkPermission("customer", "create"),
  createCustomer
);
router.get("/", authenticate, pagination, fetchCustomers);
router.get("/summary", authenticate, fetchCustomersSummary);

// Search by GSTIN (priority) or fuzzy name
router.get("/search", authenticate, searchCustomer);

// GST Lookup for customer prefill
router.post(
  "/gst-lookup",
  authenticate,
  checkPermission("customer", "view"),
  gstLookup
);

router.get(
  "/:id/monthly-material-weight",
  authenticate,
  getCustomerMonthlyMaterialWeight
);

router.get("/:id/subtrip-monthly-data", authenticate, getCustomerSubtripMonthlyData);


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
