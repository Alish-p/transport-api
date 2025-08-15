import { Router } from 'express';
import { createTransporter,
  fetchTransporters,
  deleteTransporter,
  updateTransporter,
  fetchTransporterById,
  fetchTransporterVehicles,
  fetchTransporterPayments, } from '../controllers/transporter.js';

import { authenticate, checkPermission } from '../middlewares/Auth.js';
import pagination from '../middlewares/pagination.js';

const router = Router();

router.get("/", authenticate, pagination, fetchTransporters);
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
