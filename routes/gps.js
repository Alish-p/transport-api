const { Router } = require("express");
const { getVehicleGpsData } = require("../controllers/gps");

const router = Router();

router.get("/:vehicleNo", getVehicleGpsData);

module.exports = router;