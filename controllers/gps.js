const asyncHandler = require("express-async-handler");
const { getFleetxVehicleData } = require("../helpers/fleetx");

const getVehicleGpsData = asyncHandler(async (req, res) => {
    const { vehicleNo } = req.params;
    const provider = req.query.provider || "fleetx";

    if (provider !== "fleetx") {
        return res.status(400).json({ message: "Unsupported GPS provider" });
    }

    const data = await getFleetxVehicleData(vehicleNo);

    if (!data) {
        return res.status(404).json({ message: "Vehicle not found" });
    }

    res.status(200).json(data);
});

module.exports = { getVehicleGpsData };