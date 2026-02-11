import { Router } from 'express';
import {
  createVehicle,
  quickCreateVehicle,
  fetchVehicles,
  fetchVehiclesSummary,
  fetchVehicleById,
  updateVehicle,
  deleteVehicle,
  lookupVehicleDetails,
  getTyreLayouts,
  fetchOrphanVehicles,
  cleanupVehicles,
} from './vehicle.controller.js';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

// ─── UTILS ──────────────────────────────────────────────────────────
router.get("/layouts", authenticate, getTyreLayouts);

// ─── CREATE ─────────────────────────────────────────────────────────
router.post("/", authenticate, checkPermission("vehicle", "create"), createVehicle);
router.post(
  "/quick",
  authenticate,
  checkPermission("vehicle", "create"),
  quickCreateVehicle
);

// ─── LOOKUP (External vehicle API) ─────────────────────────────────────────
router.post(
  "/lookup",
  authenticate,
  checkPermission("vehicle", "view"),
  lookupVehicleDetails
);

// ─── READ (LIST & SUMMARY) ──────────────────────────────────────────
router.get("/", authenticate, pagination, fetchVehicles);
router.get("/summary", authenticate, fetchVehiclesSummary);

// ─── CLEANUP ────────────────────────────────────────────────────────
router.get(
  "/orphans",
  authenticate,
  checkPermission("vehicle", "delete"),
  fetchOrphanVehicles
);

router.post(
  "/cleanup",
  authenticate,
  checkPermission("vehicle", "delete"),
  cleanupVehicles
);

// ─── READ (SINGLE) ────────────────────────────────────────
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
