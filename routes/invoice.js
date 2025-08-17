import { Router } from 'express';
import pagination from '../middlewares/pagination.js';
import { authenticate, checkPermission } from '../middlewares/Auth.js';
import {
  createInvoice,
  fetchInvoices,
  fetchInvoice,
  cancelInvoice,
  payInvoice,
  deleteInvoice,
} from '../controllers/invoice.js';

const router = Router();

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
router.delete(
  "/:id",
  authenticate,
  checkPermission("invoice", "delete"),
  deleteInvoice
);

export default router;
