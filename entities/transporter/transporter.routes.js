import { Router } from 'express';
import { transporterSchema } from './transporter.validation.js';
import {
  createTransporter,
  fetchTransporters,
  deleteTransporter,
  updateTransporter,
  fetchTransporterById,
  fetchTransporterVehicles,
  fetchTransporterPayments,
  fetchOrphanTransporters,
  cleanupTransporters,
} from './transporter.controller.js';

import { authenticate, checkPermission } from '../../middlewares/auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.get("/", authenticate, pagination, fetchTransporters);
router.get("/orphans", authenticate, checkPermission("transporter", "delete"), fetchOrphanTransporters);
router.post("/cleanup", authenticate, checkPermission("transporter", "delete"), cleanupTransporters);
router.get("/:id/vehicles", authenticate, fetchTransporterVehicles);
router.get("/:id/payments", authenticate, fetchTransporterPayments);
router.get("/:id", authenticate, fetchTransporterById);
router.post(
  "/",
  authenticate,
  checkPermission("transporter", "create"),
  createTransporter
);
router.delete(
  "/:id",
  authenticate,
  checkPermission("transporter", "delete"),
  deleteTransporter
);
router.put(
  "/:id",
  authenticate,
  checkPermission("transporter", "update"),
  updateTransporter
);

export default router;
