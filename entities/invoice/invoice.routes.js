import { Router } from 'express';

import pagination from '../../middlewares/pagination.js';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import {
  payInvoice,
  fetchInvoice,
  createInvoice,
  fetchInvoices,
  cancelInvoice,
  exportInvoices,
} from './invoice.controller.js';

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
