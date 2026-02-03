import { Router } from 'express';
import { invoiceSchema } from './invoice.validation.js';
import {
  createInvoice,
  fetchInvoices,
  fetchInvoice,
  cancelInvoice,
  payInvoice,
  exportInvoices,
} from './invoice.controller.js';

import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.get("/export", authenticate, exportInvoices);
router.post(
  "/",
  authenticate,
  checkPermission("invoice", "create"),
  createInvoice
);
router.get("/", authenticate, pagination, fetchInvoices);
router.get("/:id", authenticate, fetchInvoice);
router.put(
  "/:id/cancel",
  authenticate,
  checkPermission("invoice", "update"),
  cancelInvoice
);
router.put(
  "/:id/pay",
  authenticate,
  checkPermission("invoice", "update"),
  payInvoice
);
// Deletion of invoices is not allowed; delete route removed.

export default router;
