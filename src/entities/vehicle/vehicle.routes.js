import { Router } from 'express';
import {
  createVehicle,
  quickCreateVehicle,
  fetchVehicles,
  fetchVehiclesSummary,
  getVehicleBillingSummary,
  fetchVehicleById,
  updateVehicle,
  deleteVehicle,
} from './vehicle.controller.js';
import { authenticate, checkPermission } from '../../../middlewares/Auth.js';
import pagination from '../../../middlewares/pagination.js';

const router = Router();

// ─── CREATE ─────────────────────────────────────────────────────────
router.post("/", authenticate, checkPermission("vehicle", "create"), createVehicle);
router.post(
  "/quick",
  authenticate,
  checkPermission("vehicle", "create"),
  quickCreateVehicle
);

// ─── READ (LIST & SUMMARY) ──────────────────────────────────────────
router.get("/", authenticate, pagination, fetchVehicles);
router.get("/summary", authenticate, fetchVehiclesSummary);

// ─── READ (SINGLE & BILLING) ────────────────────────────────────────
router.get("/:id/billing-summary", authenticate, getVehicleBillingSummary);
router.get("/:id", authenticate, fetchVehicleById);

// ─── UPDATE ─────────────────────────────────────────────────────────
router.put(
  "/:id",
  authenticate,
  checkPermission("vehicle", "update"),
  updateVehicle
);

// ─── DELETE ─────────────────────────────────────────────────────────
router.delete(
  "/:id",
  authenticate,
  checkPermission("vehicle", "delete"),
  deleteVehicle
);

export default router;
