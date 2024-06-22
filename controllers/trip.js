const asyncHandler = require("express-async-handler");
const Trip = require("../model/Trip");
const Subtrip = require("../model/Subtrip");
const Expense = require("../model/Expense");

const createTrip = asyncHandler(async (req, res) => {
  try {
    // Destructure request body to get all data
    const { driverId, vehicleId, tripStatus, fromDate, toDate, remarks } =
      req.body;

    // Create Trip
    const trip = new Trip({
      driverId,
      vehicleId,
      tripStatus,
      fromDate,
      toDate,
      remarks,
      dateOfCreation: new Date(),
    });

    const newTrip = await trip.save();

    res.status(201).json(newTrip);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Fetch Trips
const fetchTrips = asyncHandler(async (req, res) => {
  const trips = await Trip.find()
    .populate("subtrips")
    .populate({
      path: "driverId",
      select: "driverName",
    })
    .populate({
      path: "vehicleId",
      select: "vehicleNo",
    });
  res.status(200).json(trips);
});

// fetch All details of trip
const fetchTripWithTotals = asyncHandler(async (req, res) => {
  console.log(req.params.id);

  const trip = await Trip.findById(req.params.id)
    .populate({
      path: "subtrips",
      populate: [{ path: "expenses" }, { path: "routeCd" }],
    })
    .populate({
      path: "vehicleId",
      populate: { path: "transporter" },
    })
    .populate("driverId");

  if (!trip) {
    res.status(404).json({ message: "Trip not found" });
    return;
  }

  const totalKm = trip.subtrips.reduce(
    (sum, subtrip) => sum + (subtrip.endKm - subtrip.startKm),
    0
  );
  const totalDieselAmt = trip.subtrips.reduce(
    (sum, subtrip) => sum + subtrip.dieselAmt,
    0
  );
  const totalAdblueAmt = trip.subtrips.reduce(
    (sum, subtrip) => sum + subtrip.adblueAmt,
    0
  );
  const totalExpenses = trip.subtrips.reduce(
    (sum, subtrip) =>
      sum +
      subtrip.expenses.reduce((subSum, expense) => subSum + expense.amount, 0),
    0
  );
  const totalIncome = trip.subtrips.reduce(
    (sum, subtrip) => sum + subtrip.rate,
    0
  );

  res.status(200).json({
    ...trip.toObject(),
    // totalKm,
    // totalDieselAmt,
    // totalAdblueAmt,
    // totalExpenses,
    // totalIncome,
  });
});

// Update Trip
const updateTrip = asyncHandler(async (req, res) => {
  const trip = await Trip.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  res.status(200).json(trip);
});

// Delete Trip and Associated Subtrips and Expenses
const deleteTrip = asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.id);

  if (!trip) {
    res.status(404).json({ message: "Trip not found" });
    return;
  }

  // Delete all subtrips and their expenses
  for (const subtripId of trip.subtrips) {
    await Expense.deleteMany({ subtripId });
    await Subtrip.findByIdAndDelete(subtripId);
  }

  await Trip.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: "Trip deleted successfully" });
});

// Add Subtrip to Trip
const addSubtripToTrip = asyncHandler(async (req, res) => {
  const tripId = req.params.id;
  const trip = await Trip.findById(tripId);

  if (!trip) {
    res.status(404).json({ message: "Trip not found" });
    return;
  }

  const subtrip = new Subtrip({ ...req.body });
  const newSubtrip = await subtrip.save();

  trip.subtrips.push(newSubtrip._id);
  await trip.save();

  res.status(201).json(newSubtrip);
});

module.exports = {
  createTrip,
  fetchTrips,
  fetchTripWithTotals,
  updateTrip,
  deleteTrip,
  addSubtripToTrip,
};
