const { Router } = require("express");
const {
  createVehicle,
  quickCreateVehicle,
  fetchVehicles,
  fetchVehiclesSummary,
  getVehicleBillingSummary,
  fetchVehicleById,
  updateVehicle,
  deleteVehicle,
} = require("../controllers/vehicle");
const { private, checkPermission } = require("../middlewares/Auth");
const pagination = require("../middlewares/pagination");

const router = Router();

// ─── CREATE ─────────────────────────────────────────────────────────
router.post(
  "/",
  private,
  checkPermission("vehicle", "create"),
  createVehicle
);
router.post(
  "/quick",
  private,
  checkPermission("vehicle", "create"),
  quickCreateVehicle
);

// ─── READ (LIST & SUMMARY) ──────────────────────────────────────────
router.get(
  "/",
  private,
  pagination,
  fetchVehicles
);
router.get(
  "/summary",
  private,
  fetchVehiclesSummary
);

// ─── READ (SINGLE & BILLING) ────────────────────────────────────────
router.get(
  "/:id/billing-summary",
  getVehicleBillingSummary
);
router.get(
  "/:id",
  fetchVehicleById
);

// ─── UPDATE ─────────────────────────────────────────────────────────
router.put(
  "/:id",
  private,
  checkPermission("vehicle", "update"),
  updateVehicle
);

// ─── DELETE ─────────────────────────────────────────────────────────
router.delete(
  "/:id",
  private,
  checkPermission("vehicle", "delete"),
  deleteVehicle
);

module.exports = router;
