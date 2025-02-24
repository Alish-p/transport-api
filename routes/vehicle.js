const { Router } = require("express");
const {
  createVehicle,
  fetchVehicles,
  deleteVehicle,
  updateVehicle,
  fetchVehicleById,
} = require("../controllers/vehicle");

const { private, admin } = require("../middlewares/Auth");
const router = Router();

router.post("/", createVehicle);
router.get("/", fetchVehicles);
router.get("/:id", fetchVehicleById);
router.delete("/:id", deleteVehicle);
router.put("/:id", updateVehicle);

module.exports = router;
