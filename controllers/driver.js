const asyncHandler = require("express-async-handler");
const Driver = require("../model/Driver");
const Trip = require("../model/Trip");
const Subtrip = require("../model/Subtrip");
const { addTenantToQuery } = require("../utills/tenant-utils");

// Create Driver
const createDriver = asyncHandler(async (req, res) => {
  const driver = new Driver({
    ...req.body,
    driverName: req.body.driverName.trim(),
    tenant: req.tenant,
  });
  const newDriver = await driver.save();

  res.status(201).json(newDriver);
});

// Quick Create Driver (only name & cell number)
const quickCreateDriver = asyncHandler(async (req, res) => {
  const { driverName, driverCellNo } = req.body;

  if (!driverName || !driverCellNo) {
    return res
      .status(400)
      .json({ message: "driverName and driverCellNo are required" });
  }

  const now = new Date();

  const driver = new Driver({
    driverName: driverName.trim(),
    driverCellNo,
    driverLicenceNo: "N/A",
    driverPresentAddress: "N/A",
    licenseFrom: now,
    licenseTo: new Date(now.getFullYear() + 5, now.getMonth(), now.getDate()),
    aadharNo: "N/A",
    experience: 0,
    permanentAddress: "N/A",
    tenant: req.tenant,
  });

  const newDriver = await driver.save();

  res.status(201).json(newDriver);
});

// Fetch Drivers with pagination and search
const fetchDrivers = asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (search) {
      query.$or = [
        { driverName: { $regex: search, $options: "i" } },
        { driverCellNo: { $regex: search, $options: "i" } },
      ];
    }

    const now = new Date();

    const [drivers, totalAll, validCount] = await Promise.all([
      Driver.find(query)
        .select(
          "-guarantorName -guarantorCellNo -dob -dlImage -photoImage -aadharImage -bankDetails"
        )
        .sort({ driverName: 1 })
        .skip(skip)
        .limit(limit),
      Driver.countDocuments(query),
      Driver.countDocuments({ ...query, licenseTo: { $gte: now } }),
    ]);

    res.status(200).json({
      drivers,
      totals: {
        all: { count: totalAll },
        valid: { count: validCount },
        expired: { count: totalAll - validCount },
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
  const drivers = await Driver.find({ tenant: req.tenant }).select(
    "driverName driverCellNo"
  );
  res.status(200).json(drivers);
});

// Fetch Driver by ID
const fetchDriverById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const driver = await Driver.findOne({ _id: id, tenant: req.tenant });
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

  const driver = await Driver.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    req.body,
    { new: true }
  );

  res.status(200).json(driver);
});

// Delete Driver
const deleteDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const driver = await Driver.findOneAndDelete({ _id: id, tenant: req.tenant });

  res.status(200).json(driver);
});

// Fetch subtrips done by a driver
const fetchDriverSubtrips = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // fetch trips for the driver
    const trips = await Trip.find(
      addTenantToQuery(req, { driverId: id })
    ).select("subtrips");

    const subtripIds = trips.flatMap((trip) => trip.subtrips);

    const subtrips = await Subtrip.find(
      addTenantToQuery(req, { _id: { $in: subtripIds } })
    )
      .populate({
        path: "tripId",
        populate: [
          {
            path: "vehicleId",
            select: "vehicleNo vehicleType noOfTyres",
          },
          {
            path: "driverId",
            select: "driverName",
          },
        ],
      })
      .populate({
        path: "customerId",
        select: "customerName",
      })
      .populate("expenses")
      .select(
        "loadingPoint unloadingPoint subtripStatus expenses startDate endDate tripId customerId"
      );

    res.status(200).json(subtrips);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching subtrips for the driver",
      error: error.message,
    });
  }
});

module.exports = {
  createDriver,
  quickCreateDriver,
  fetchDrivers,
  fetchDriversSummary,
  fetchDriverById,
  updateDriver,
  deleteDriver,
  fetchDriverSubtrips,
};
