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
      tripStatus: "pending",
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
    .populate({
      path: "subtrips",
      populate: [{ path: "customerId", model: "Customer" }],
    })
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
  const trip = await Trip.findById(req.params.id)
    .populate({
      path: "subtrips",
      populate: [
        { path: "expenses" },
        { path: "routeCd" },
        { path: "customerId" },
      ],
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

// Update Trip and Close it
const closeTrip = asyncHandler(async (req, res) => {
  const tripId = req.params.id;

  // Find the trip by ID and update it
  const trip = await Trip.findByIdAndUpdate(
    tripId,
    {
      tripStatus: "closed",
      toDate: new Date(),
    },
    { new: true } // Return the updated document
  );

  if (!trip) {
    res.status(404);
    throw new Error("Trip not found");
  }

  res.status(200).json(trip);
});

// Update Trip
const updateTrip = asyncHandler(async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      res.status(404);
      throw new Error("Trip not found");
    }

    // Check if trip is billed
    if (trip.tripStatus === "billed") {
      res.status(400);
      throw new Error("Cannot update a billed trip");
    }

    const updatedTrip = await Trip.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json(updatedTrip);
  } catch (error) {
    console.error(error);
    res.status(500);
    throw new Error("Error updating trip");
  }
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

const changeTripStatusToBilled = asyncHandler(async (req, res) => {
  const tripId = req.params.id;

  // Find the trip and populate its subtrips
  const trip = await Trip.findById(tripId).populate("subtrips");

  if (!trip) {
    res.status(404);
    throw new Error("Trip not found");
  }

  // Check if trip is already billed
  if (trip.tripStatus === "billed") {
    res.status(400);
    throw new Error("Trip is already billed");
  }

  // Check if all subtrips exist and are billed
  if (trip.subtrips.length === 0) {
    res.status(400);
    throw new Error("Cannot bill a trip with no subtrips");
  }

  const allSubtripsBilled = trip.subtrips.every(
    (subtrip) => subtrip.subtripStatus === "billed"
  );
  if (!allSubtripsBilled) {
    res.status(400);
    throw new Error("All subtrips must be billed before billing the trip");
  }

  // Update trip status to billed
  trip.tripStatus = "billed";
  const updatedTrip = await trip.save();

  res.status(200).json(updatedTrip);
});

module.exports = {
  createTrip,
  fetchTrips,
  fetchTripWithTotals,
  closeTrip,
  updateTrip,
  deleteTrip,
  changeTripStatusToBilled,
};
