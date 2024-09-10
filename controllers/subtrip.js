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

  // setting a status in-queue when created
  const subtrip = new Subtrip({
    ...req.body,
    tripId,
    subtripStatus: "in-queue",
  });
  const newSubtrip = await subtrip.save();

  trip.subtrips.push(newSubtrip._id);
  await trip.save();

  res.status(201).json(newSubtrip);
});

// Fetch Subtrips
const fetchSubtrips = asyncHandler(async (req, res) => {
  const subtrips = await Subtrip.find()
    .populate("expenses")
    .populate("routeCd")
    .populate("customerId")
    .populate({
      path: "tripId",
      populate: {
        path: "vehicleId",
      },
    });
  res.status(200).json(subtrips);
});

// Fetch Single Subtrip
const fetchSubtrip = asyncHandler(async (req, res) => {
  const subtrip = await Subtrip.findById(req.params.id)
    .populate({
      path: "expenses",
      populate: [{ path: "pumpCd", model: "Pump" }],
    })
    .populate("routeCd")
    .populate("customerId")
    .populate({
      path: "tripId",
      populate: [
        { path: "driverId", model: "Driver" },
        { path: "vehicleId", model: "Vehicle" },
      ],
    });

  if (!subtrip) {
    res.status(404).json({ message: "Subtrip not found" });
    return;
  }

  res.status(200).json(subtrip);
});

// Add Material Info to Subtrip
const addMaterialInfo = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    materialType,
    quantity,
    grade,
    loadingWeight,
    rate,
    startKm,
    invoiceNo,
    shipmentNo,
    orderNo,
    ewayBill,
    ewayExpiryDate,
    tds,
    driverAdvance,
    dieselLtr,
    pumpCd,
    vehicleId,
  } = req.body;

  const subtrip = await Subtrip.findById(id).populate("customerId");

  if (!subtrip) {
    res.status(404).json({ message: "Subtrip not found" });
    return;
  }

  subtrip.loadingWeight = loadingWeight;
  subtrip.startKm = startKm;
  subtrip.rate = rate;
  subtrip.invoiceNo = invoiceNo;
  subtrip.shipmentNo = shipmentNo;
  subtrip.orderNo = orderNo;
  subtrip.ewayBill = ewayBill;
  subtrip.ewayExpiryDate = ewayExpiryDate;
  subtrip.materialType = materialType;
  subtrip.quantity = quantity;
  subtrip.grade = grade;
  subtrip.tds = tds;

  subtrip.subtripStatus = "loaded";

  // Create expenses for driverAdvance and dieselLtr
  const driverAdvanceExpense = new Expense({
    tripId: subtrip.tripId,
    subtripId: id,
    expenseType: "trip-advance",
    expenseCategory: "subtrip",
    amount: driverAdvance,
    paidThrough: "Pump",
    authorisedBy: "System",
    slipNo: "N/A",
    remarks: "Advance paid to driver",
    vehicleId: vehicleId,
  });

  const dieselExpense = new Expense({
    tripId: subtrip.tripId,
    subtripId: id,
    expenseType: "diesel",
    expenseCategory: "subtrip",
    amount: dieselLtr,
    dieselLtr: dieselLtr,
    pumpCd: pumpCd,
    paidThrough: "Pump",
    authorisedBy: "System",
    slipNo: "N/A",
    remarks: "Advance Diesel purchased",
    vehicleId: vehicleId,
  });

  // Save expenses
  const savedDriverAdvanceExpense = await driverAdvanceExpense.save();
  const savedDieselExpense = await dieselExpense.save();

  // Add expense IDs to subtrip
  subtrip.expenses.push(savedDriverAdvanceExpense._id, savedDieselExpense._id);

  const updated = await subtrip.save();

  res.status(200).json(updated);
});

// received Subtrip (LR)
const receiveLR = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    unloadingWeight,
    endDate,
    endKm,
    deductedWeight,
    detentionTime,
    hasError,
    remarks,
  } = req.body;

  const subtrip = await Subtrip.findById(id).populate("customerId");

  if (!subtrip) {
    res.status(404).json({ message: "Subtrip not found" });
    return;
  }

  subtrip.unloadingWeight = unloadingWeight;
  subtrip.endDate = endDate;
  subtrip.endKm = endKm;
  subtrip.deductedWeight = deductedWeight;
  subtrip.detentionTime = detentionTime;

  subtrip.subtripStatus = hasError ? "error" : "received";

  subtrip.remarks = remarks;

  await subtrip.save();

  res.status(200).json(subtrip);
});

// received Subtrip (LR)
const resolveLR = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { hasError, remarks } = req.body;

  const subtrip = await Subtrip.findById(id).populate("customerId");

  if (!subtrip) {
    res.status(404).json({ message: "Subtrip not found" });
    return;
  }

  subtrip.hasError = hasError;

  subtrip.subtripStatus = "received";

  subtrip.remarks = remarks;

  await subtrip.save();

  res.status(200).json(subtrip);
});

const CloseSubtrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const subtrip = await Subtrip.findById(id).populate("customerId");

  if (!subtrip) {
    res.status(404).json({ message: "Subtrip not found" });
    return;
  }

  subtrip.subtripStatus = "closed";
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
  const subtrip = await Subtrip.findById(subtripId).populate("customerId");

  if (!subtrip) {
    res.status(404).json({ message: "Subtrip not found" });
    return;
  }

  const expense = new Expense({
    ...req.body,
    subtripId,
    tripId: subtrip.tripId,
    expenseCategory: "subtrip",
  });
  const newExpense = await expense.save();

  subtrip.expenses.push(newExpense._id);
  await subtrip.save();

  res.status(201).json(newExpense);
});

// Billings

const fetchClosedTripsByCustomerAndDate = asyncHandler(async (req, res) => {
  console.log("Fetch closed trips");
  const { customerId, fromDate, toDate } = req.body;

  const closedSubtrips = await Subtrip.find({
    subtripStatus: "closed",
    customerId,
    startDate: {
      $gte: new Date(fromDate),
      $lte: new Date(toDate),
    },
  });

  res.status(200).json(closedSubtrips);
});

module.exports = {
  createSubtrip,
  fetchSubtrips,
  fetchSubtrip,
  updateSubtrip,
  deleteSubtrip,
  addExpenseToSubtrip,
  addMaterialInfo,
  receiveLR,
  resolveLR,
  CloseSubtrip,

  // billing
  fetchClosedTripsByCustomerAndDate,
};
