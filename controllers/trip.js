const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const Trip = require("../model/Trip");
const Subtrip = require("../model/Subtrip");
const Expense = require("../model/Expense");
const { TRIP_STATUS } = require("../constants/trip-constants");

const createTrip = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { driverId, vehicleId, fromDate, remarks, closePreviousTrips } =
      req.body;

    // 1) If requested, close all existing OPEN trips for this vehicle (inside txn)
    if (closePreviousTrips) {
      await Trip.updateMany(
        { vehicleId, tripStatus: TRIP_STATUS.OPEN },
        { tripStatus: TRIP_STATUS.CLOSED, toDate: new Date() },
        { session }
      );
    }

    // 2) Create the new trip (inside txn)
    const trip = new Trip(
      {
        driverId,
        vehicleId,
        tripStatus: TRIP_STATUS.OPEN,
        fromDate,
        remarks,
        dateOfCreation: new Date(),
      },
      { session }
    );
    const newTrip = await trip.save({ session });

    // 3) Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(201).json(newTrip);
  } catch (error) {
    // If anything goes wrong, abort the transaction
    await session.abortTransaction();
    session.endSession();

    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Fetch Trips with pagination and search
const fetchTrips = asyncHandler(async (req, res) => {
  try {
    const {
      tripId,
      driverId,
      vehicleId,
      subtripId,
      fromDate,
      toDate,
      status,
    } = req.query;

    const { limit, skip } = req.pagination || {};

    const query = {};

    if (tripId) query._id = tripId;
    if (driverId) query.driverId = driverId;
    if (vehicleId) query.vehicleId = vehicleId;
    if (subtripId) query.subtrips = subtripId;

    if (fromDate || toDate) {
      query.fromDate = {};
      if (fromDate) query.fromDate.$gte = new Date(fromDate);
      if (toDate) query.fromDate.$lte = new Date(toDate);
    }

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      query.tripStatus = { $in: statuses };
    }

    const [trips, total, totalClosed, totalOpen] = await Promise.all([
      Trip.find(query)
        .populate({
          path: "subtrips",
          populate: [{ path: "customerId", model: "Customer" }],
        })
        .populate({ path: "driverId", select: "driverName" })
        .populate({ path: "vehicleId", select: "vehicleNo" })
        .sort({ fromDate: -1 })
        .skip(skip)
        .limit(limit),
      Trip.countDocuments(query),
      Trip.countDocuments({ ...query, tripStatus: TRIP_STATUS.CLOSED }),
      Trip.countDocuments({ ...query, tripStatus: TRIP_STATUS.OPEN }),
    ]);

    res.status(200).json({
      trips,
      total,
      totalClosed,
      totalOpen,
      startRange: (skip || 0) + 1,
      endRange: (skip || 0) + trips.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching trips",
      error: error.message,
    });
  }
});

const fetchOpenTrips = asyncHandler(async (req, res) => {
  const openTrips = await Trip.find({ tripStatus: TRIP_STATUS.OPEN })
    .select("_id tripStatus fromDate")
    .populate({
      path: "driverId",
      select: "driverName",
    })
    .populate({
      path: "vehicleId",
      select: "vehicleNo",
    });
  res.status(200).json(openTrips);
});

// fetch All details of trip
const fetchTrip = asyncHandler(async (req, res) => {
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

  res.status(200).json(trip);
});

// Update Trip and Close it
const closeTrip = asyncHandler(async (req, res) => {
  const tripId = req.params.id;

  // Find the trip by ID and update it
  const trip = await Trip.findByIdAndUpdate(
    tripId,
    {
      tripStatus: TRIP_STATUS.CLOSED,
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
  const { id } = req.params;

  // 1. Fetch the trip
  const trip = await Trip.findById(id);
  if (!trip) {
    res.status(404);
    throw new Error("Trip not found");
  }

  // 2. Can't update a billed trip at all
  if (trip.tripStatus === TRIP_STATUS.CLOSED) {
    res.status(400);
    throw new Error("Cannot update a closed trip");
  }

  // 3. If the client is trying to change the driver...
  if (
    req.body.driverId &&
    String(req.body.driverId) !== String(trip.driverId)
  ) {
    // 3a. Check for any subtrip with a salary already assigned
    const lockedCount = await Subtrip.countDocuments({
      tripId: trip._id,
      driverSalaryId: { $exists: true, $ne: null },
    });

    if (lockedCount > 0) {
      res.status(400);
      throw new Error(
        "Cannot change driver: one or more subtrips already have salary created."
      );
    }
  }

  // 4. Perform the update
  const updatedTrip = await Trip.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json(updatedTrip);
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

module.exports = {
  createTrip,
  fetchTrips,
  fetchOpenTrips,
  fetchTrip,
  closeTrip,
  updateTrip,
  deleteTrip,
};
