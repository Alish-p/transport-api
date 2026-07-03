import { Router } from 'express';

import pagination from '../../middlewares/pagination.js';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import {
  exportTransporterPayments,
  fetchTransporterPaymentReceipt,
  createTransporterPaymentReceipt,
  fetchTransporterPaymentReceipts,
  updateTransporterPaymentReceipt,
  deleteTransporterPaymentReceipt,
  createBulkTransporterPaymentReceipts,
} from './transporterPayment.controller.js';

const router = Router();

router.get("/export", authenticate, exportTransporterPayments);

router.post(
  "/",
  authenticate,
  checkPermission("transporterPayment", "create"),
  createTransporterPaymentReceipt
);
router.post(
  "/bulk-transporter-payment",
  authenticate,
  checkPermission("transporterPayment", "create"),
  createBulkTransporterPaymentReceipts
);
router.get("/", authenticate, pagination, fetchTransporterPaymentReceipts);
router.get("/:id", authenticate, fetchTransporterPaymentReceipt);
router.put(
  "/:id",
  authenticate,
  checkPermission("transporterPayment", "update"),
  updateTransporterPaymentReceipt
);
router.delete(
  "/:id",
  authenticate,
  checkPermission("transporterPayment", "delete"),
  deleteTransporterPaymentReceipt
);

export default router;
