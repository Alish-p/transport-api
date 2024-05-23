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

// Update Driver
const updateDriver = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const driver = await Driver.findByIdAndUpdate(id, req.body, { new: true });

  res.status(200).json(driver);
});

// Delete Driver
const deleteDriver = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const driver = await Driver.findByIdAndDelete(id);

  res.status(200).json(driver);
});

module.exports = {
  createDriver,
  fetchDrivers,
  updateDriver,
  deleteDriver,
};
