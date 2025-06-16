const asyncHandler = require("express-async-handler");
const Driver = require("../model/Driver");

// Create Driver
const createDriver = asyncHandler(async (req, res) => {
  const driver = new Driver({ ...req.body });
  const newDriver = await driver.save();

  res.status(201).json(newDriver);
});

// Fetch Drivers with pagination and search
const fetchDrivers = asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;
    const { limit, skip } = req.pagination;

    const query = {};

    if (search) {
      query.$or = [
        { driverName: { $regex: search, $options: "i" } },
        { driverCellNo: { $regex: search, $options: "i" } },
      ];
    }

    const now = new Date();

    const [drivers, totalAll, validCount, expiredCount] = await Promise.all([
      Driver.find(query)
        .select(
          "-guarantorName -guarantorCellNo -dob -dlImage -photoImage -aadharImage -bankDetails"
        )
        .sort({ driverName: 1 })
        .skip(skip)
        .limit(limit),
      Driver.countDocuments(query),
      Driver.countDocuments({ ...query, licenseTo: { $gte: now } }),
      Driver.countDocuments({ ...query, licenseTo: { $lt: now } }),
    ]);

    res.status(200).json({
      drivers,
      totals: {
        all: { count: totalAll },
        valid: { count: validCount },
        expired: { count: expiredCount },
      },
      startRange: skip + 1,
      endRange: skip + drivers.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching paginated drivers",
      error: error.message,
    });
  }
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
