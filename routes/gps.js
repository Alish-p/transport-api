const { Router } = require("express");
const { getVehicleGpsData } = require("../controllers/gps");

const router = Router();
const { private } = require("../middlewares/Auth");

router.get("/:vehicleNo", private, getVehicleGpsData);

module.exports = router;
