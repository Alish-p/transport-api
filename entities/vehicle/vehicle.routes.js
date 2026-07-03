import { Router } from 'express';

import pagination from '../../middlewares/pagination.js';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import {
  createVehicle,
  fetchVehicles,
  updateVehicle,
  deleteVehicle,
  getTyreLayouts,
  exportVehicles,
  cleanupVehicles,
  fetchVehicleById,
  quickCreateVehicle,
  fetchOrphanVehicles,
  bulkUpdateVehicleKm,
  fetchVehiclesSummary,
  lookupVehicleDetails,
  getVehicleKmTemplate,
  getVehicleMonthlyAnalytics,
} from './vehicle.controller.js';

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
router.get("/export", authenticate, checkPermission("vehicle", "view"), exportVehicles);

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

// ─── BULK EXPORT/IMPORT ────────────────────────────────────────────────
router.get("/km-template", authenticate, getVehicleKmTemplate);
router.post(
  "/bulk-km",
  authenticate,
  checkPermission("vehicle", "update"),
  bulkUpdateVehicleKm
);

// ─── READ (SINGLE) ────────────────────────────────────────
router.get("/:id", authenticate, fetchVehicleById);
router.get("/:id/analytics", authenticate, getVehicleMonthlyAnalytics);

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
