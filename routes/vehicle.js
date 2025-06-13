const { Router } = require("express");
const {
  createVehicle,
  fetchVehicles,
  deleteVehicle,
  updateVehicle,
  fetchVehicleById,
  fetchVehiclesSummary,
} = require("../controllers/vehicle");

const { private, admin, checkPermission } = require("../middlewares/Auth");

const router = Router();

router.post("/", private, checkPermission("vehicle", "create"), createVehicle);
router.get("/", private, fetchVehicles);
router.get("/summary", private, fetchVehiclesSummary);
router.get("/:id", fetchVehicleById);
router.delete("/:id", private, checkPermission("vehicle", "delete"), deleteVehicle);
router.put("/:id", private, checkPermission("vehicle", "update"), updateVehicle);

module.exports = router;
