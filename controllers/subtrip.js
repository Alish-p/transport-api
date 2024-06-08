const asyncHandler = require("express-async-handler");
const Trip = require("../model/Trip");
const Subtrip = require("../model/Subtrip");
const Expense = require("../model/Expense");

// Create Subtrip
const createSubtrip = asyncHandler(async (req, res) => {
  const tripId = req.params.tripId;
  const trip = await Trip.findById(tripId);

  console.log(`create subtrip called with tripId ${tripId} `);

  if (!trip) {
    res.status(404).json({ message: "Trip not found" });
    return;
  }

  const subtrip = new Subtrip({ ...req.body, tripId });
  const newSubtrip = await subtrip.save();

  trip.subtrips.push(newSubtrip._id);
  await trip.save();

  res.status(201).json(newSubtrip);
});

// Fetch Subtrips
const fetchSubtrips = asyncHandler(async (req, res) => {
  const subtrips = await Subtrip.find().populate("expenses");
  res.status(200).json(subtrips);
});

// Fetch Single Subtrip
const fetchSubtrip = asyncHandler(async (req, res) => {
  const subtrip = await Subtrip.findById(req.params.id).populate("expenses");

  if (!subtrip) {
    res.status(404).json({ message: "Subtrip not found" });
    return;
  }

  res.status(200).json(subtrip);
});

// Add Material Info to Subtrip
const addMaterialInfo = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { materialType, quantity, grade } = req.body;

  const subtrip = await Subtrip.findById(id);

  if (!subtrip) {
    res.status(404).json({ message: "Subtrip not found" });
    return;
  }

  subtrip.materialType = materialType;
  subtrip.quantity = quantity;
  subtrip.grade = grade;

  await subtrip.save();

  res.status(200).json(subtrip);
});

// Close Subtrip (LR)
const closeLR = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { unloadingWeight, endDate, endKm, deductedWeight, detentionTime } =
    req.body;

  const subtrip = await Subtrip.findById(id);

  if (!subtrip) {
    res.status(404).json({ message: "Subtrip not found" });
    return;
  }

  subtrip.unloadingWeight = unloadingWeight;
  subtrip.endDate = endDate;
  subtrip.endKm = endKm;
  subtrip.deductedWeight = deductedWeight;
  subtrip.detentionTime = detentionTime;
  subtrip.subtripStatus = "completed"; // Assuming subtrip is closed

  await subtrip.save();

  res.status(200).json(subtrip);
});

// To-do check to update start/end kms
// Update Subtrip
const updateSubtrip = asyncHandler(async (req, res) => {
  const subtrip = await Subtrip.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  res.status(200).json(subtrip);
});

// Delete Subtrip
const deleteSubtrip = asyncHandler(async (req, res) => {
  const subtrip = await Subtrip.findById(req.params.id);

  if (!subtrip) {
    res.status(404).json({ message: "Subtrip not found" });
    return;
  }

  await Expense.deleteMany({ _id: { $in: subtrip.expenses } });
  await Subtrip.findByIdAndDelete(req.params.id);

  const trip = await Trip.findOne({ subtrips: req.params.id });
  if (trip) {
    trip.subtrips.pull(req.params.id);
    await trip.save();
  }

  res.status(200).json({ message: "Subtrip deleted successfully" });
});

// Add Expense to Subtrip
const addExpenseToSubtrip = asyncHandler(async (req, res) => {
  const subtripId = req.params.id;
  const subtrip = await Subtrip.findById(subtripId);

  if (!subtrip) {
    res.status(404).json({ message: "Subtrip not found" });
    return;
  }

  const expense = new Expense({
    ...req.body,
    subtripId,
    tripId: subtrip.tripId,
  });
  const newExpense = await expense.save();

  subtrip.expenses.push(newExpense._id);
  await subtrip.save();

  res.status(201).json(newExpense);
});

module.exports = {
  createSubtrip,
  fetchSubtrips,
  fetchSubtrip,
  updateSubtrip,
  deleteSubtrip,
  addExpenseToSubtrip,
  addMaterialInfo,
  closeLR,
};
