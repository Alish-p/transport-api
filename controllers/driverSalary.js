const asyncHandler = require("express-async-handler");
const DriverSalaryReceipt = require("../model/DriverSalary");
const Subtrip = require("../model/Subtrip");

// Create Driver Salary Receipt with User-Selected Subtrips
const createDriverSalary = asyncHandler(async (req, res) => {
  const {
    driverId,
    periodStartDate,
    periodEndDate,
    otherSalaryComponent,
    subtripComponents,
    totalSalary,
  } = req.body;

  // Create a new driver salary receipt
  const newDriverSalary = new DriverSalaryReceipt({
    driverId,
    periodStartDate,
    periodEndDate,
    otherSalaryComponent,
    status: "Pending",
    totalSalary,
    createdDate: new Date(),
    subtripComponents,
  });

  // Save the new driver salary receipt
  const savedDriverSalary = await newDriverSalary.save();
  res.status(201).json(savedDriverSalary);
});

// Fetch All Driver Salary Receipts
const fetchDriverSalaries = asyncHandler(async (req, res) => {
  const driverSalaries = await DriverSalaryReceipt.find()
    .populate("driverId")
    .populate("subtripComponents.subtripId");

  res.status(200).json(driverSalaries);
});

// Fetch Single Driver Salary Receipt
const fetchDriverSalary = asyncHandler(async (req, res) => {
  const driverSalary = await DriverSalaryReceipt.findById(
    req.params.id.toUpperCase()
  )
    .populate("driverId")
    .populate({
      path: "subtripComponents.subtripId",
      populate: [
        {
          path: "tripId",
          populate: {
            path: "vehicleId",
          },
        },
        {
          path: "routeCd",
        },
        {
          path: "expenses",
        },
      ],
    });

  if (!driverSalary) {
    res.status(404).json({ message: "Driver salary receipt not found" });
    return;
  }

  res.status(200).json(driverSalary);
});

// Update Driver Salary Receipt
const updateDriverSalary = asyncHandler(async (req, res) => {
  const updatedDriverSalary = await DriverSalaryReceipt.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
    }
  );

  if (!updatedDriverSalary) {
    res.status(404).json({ message: "Driver salary receipt not found" });
    return;
  }

  res.status(200).json(updatedDriverSalary);
});

// Delete Driver Salary Receipt
const deleteDriverSalary = asyncHandler(async (req, res) => {
  const driverSalary = await DriverSalaryReceipt.findById(req.params.id);

  if (!driverSalary) {
    res.status(404).json({ message: "Driver salary receipt not found" });
    return;
  }

  await DriverSalaryReceipt.findByIdAndDelete(req.params.id);
  res
    .status(200)
    .json({ message: "Driver salary receipt deleted successfully" });
});

module.exports = {
  createDriverSalary,
  fetchDriverSalaries,
  fetchDriverSalary,
  updateDriverSalary,
  deleteDriverSalary,
};
