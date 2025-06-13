const asyncHandler = require("express-async-handler");
const Vehicle = require("../model/Vehicle");
const Subtrip = require("../model/Subtrip");
const Expense = require("../model/Expense");
const { EXPENSE_CATEGORIES } = require("../constants/status");

// Create Vehicle
const createVehicle = asyncHandler(async (req, res) => {
  // Ensure transporter is null if the vehicle is owned
  if (req.body.isOwn) {
    req.body.transporter = null;
  }

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

// fetch vehicles
const fetchVehiclesSummary = asyncHandler(async (req, res) => {
  const drivers = await Vehicle.find()
    .select("vehicleNo vehicleType modelType vehicleCompany noOfTyres isOwn")
    .populate("transporter", "transportName");
  res.status(200).json(drivers);
});

// fetch single vehicle by id
const fetchVehicleById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const vehicle = await Vehicle.findById(id).populate(
    "transporter",
    "transportName"
  );
  if (!vehicle) {
    res.status(404).json({ message: "Vehicle not found" });
    return;
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const subtripsData = await Subtrip.find({ startDate: { $gte: sixMonthsAgo } })
    .select("_id loadingPoint unloadingPoint startDate subtripStatus tripId")
    .populate({
      path: "tripId",
      match: { vehicleId: id },
      select: "vehicleId driverId",
      populate: [
        { path: "vehicleId", select: "vehicleNo isOwn" },
        { path: "driverId", select: "driverName" },
      ],
    })
    .sort({ startDate: -1 })
    .lean();
  const subtrips = subtripsData.filter((st) => st.tripId);

  const expenses = await Expense.find({
    vehicleId: id,
    expenseCategory: EXPENSE_CATEGORIES.VEHICLE,
    date: { $gte: sixMonthsAgo },
  })
    .populate("pumpCd")
    .sort({ date: -1 })
    .lean();

  res.status(200).json({ vehicle, subtrips, expenses });
});

// Update Vehicle
const updateVehicle = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Ensure transporter is null if the vehicle is owned
  if (req.body.isOwn) {
    req.body.transporter = null;
  }
  const vehicle = await Vehicle.findByIdAndUpdate(id, req.body, { new: true });

  res.status(200).json(vehicle);
});

// Delete Vehicle
const deleteVehicle = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const vehicle = await Vehicle.findByIdAndDelete(id);

  res.status(200).json(vehicle);
});

module.exports = {
  createVehicle,
  fetchVehicles,
  fetchVehiclesSummary,
  fetchVehicleById,
  updateVehicle,
  deleteVehicle,
};
