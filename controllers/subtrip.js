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
    consignee,
  } = req.body;

  // Fetch the subtrip with all necessary populates
  const subtrip = await Subtrip.findById(id)
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
    return res.status(404).json({ message: "Subtrip not found" });
  }

  // Update subtrip fields
  Object.assign(subtrip, {
    loadingWeight,
    startKm,
    rate,
    invoiceNo,
    shipmentNo,
    orderNo,
    ewayBill,
    ewayExpiryDate,
    materialType,
    quantity,
    grade,
    tds,
    initialDiesel: dieselLtr,
    consignee,
    subtripStatus: "loaded",
  });

  // Create driver advance expense
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
    pumpCd: pumpCd,
  });

  // Save the driver advance expense
  const savedDriverAdvanceExpense = await driverAdvanceExpense.save();

  // Add the new expense to the subtrip's expenses
  subtrip.expenses.push(savedDriverAdvanceExpense._id);

  // Save the updated subtrip
  await subtrip.save();

  // Re-fetch the updated subtrip with all populates
  const updatedSubtrip = await Subtrip.findById(id)
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

  // Return the fully populated subtrip
  res.status(200).json(updatedSubtrip);
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

  const subtrip = await Subtrip.findById(id)
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

  const subtrip = await Subtrip.findById(id)
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

  subtrip.hasError = hasError;

  subtrip.subtripStatus = "received";

  subtrip.remarks = remarks;

  await subtrip.save();

  res.status(200).json(subtrip);
});

const CloseSubtrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const subtrip = await Subtrip.findById(id)
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
  const subtrip = await Subtrip.findById(subtripId)
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
  })
    .populate("routeCd")
    .populate({
      path: "tripId",
      populate: {
        path: "vehicleId",
      },
    });

  res.status(200).json(closedSubtrips);
});

// DriverSalary
const fetchTripsCompletedByDriverAndDate = asyncHandler(async (req, res) => {
  console.log("Fetch completed trips by driver and date range");
  const { driverId, fromDate, toDate } = req.body;

  const completedTrips = await Subtrip.find({
    subtripStatus: "closed",
    startDate: {
      $gte: new Date(fromDate),
      $lte: new Date(toDate),
    },
  })
    .populate({
      path: "tripId",
      match: { driverId },
      populate: {
        path: "vehicleId",
      },
    })
    .populate("routeCd");

  // Filter out any null values in the result if no trip matches the driverId
  const filteredTrips = completedTrips.filter((subtrip) => subtrip.tripId);

  res.status(200).json(filteredTrips);
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
  fetchTripsCompletedByDriverAndDate,
};
