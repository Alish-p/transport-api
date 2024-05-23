const asyncHandler = require("express-async-handler");
const Vehicle = require("../model/Vehicle");

// Create Vehicle
const createVehicle = asyncHandler(async (req, res) => {
  const vehicle = new Vehicle({ ...req.body });
  const newVehicle = await vehicle.save();

  res.status(201).json(newVehicle);
});

// fetch vehicles
const fetchVehicles = asyncHandler(async (req, res) => {
  const vehicles = await Vehicle.find().populate(
    "transporter",
    "transportName"
  );
  res.status(200).json(vehicles);
});

// Update Vehicle
const updateVehicle = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const vehicle = await Vehicle.findByIdAndUpdate(id, req.body, { new: true });

  res.status(200).json(vehicle);
});

// Delete Vehicle
const deleteVehicle = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const vehicle = await Vehicle.findByIdAndDelete(id);

  res.status(200).json(vehicle);
});

module.exports = {
  createVehicle,
  fetchVehicles,
  updateVehicle,
  deleteVehicle,
};
