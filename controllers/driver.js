const asyncHandler = require("express-async-handler");
const Driver = require("../model/Driver");

// Create Driver
const createDriver = asyncHandler(async (req, res) => {
  const driver = new Driver({ ...req.body });
  const newDriver = await driver.save();

  res.status(201).json(newDriver);
});

// Fetch Drivers
const fetchDrivers = asyncHandler(async (req, res) => {
  const drivers = await Driver.find();
  res.status(200).json(drivers);
});

// Fetch Light Drivers (only name, cellNo)
const fetchDriversSummary = asyncHandler(async (req, res) => {
  const drivers = await Driver.find().select("driverName driverCellNo");
  res.status(200).json(drivers);
});

// Fetch Driver by ID
const fetchDriverById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const driver = await Driver.findById(id);
  if (!driver) {
    res.status(404).json({ message: "Driver not found" });
  } else {
    res.status(200).json(driver);
  }
});

// Update Driver
const updateDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;
  console.log({ id, body: req.body });

  const driver = await Driver.findByIdAndUpdate(id, req.body, { new: true });

  res.status(200).json(driver);
});

// Delete Driver
const deleteDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const driver = await Driver.findByIdAndDelete(id);

  res.status(200).json(driver);
});

module.exports = {
  createDriver,
  fetchDrivers,
  fetchDriversSummary,
  fetchDriverById,
  updateDriver,
  deleteDriver,
};
