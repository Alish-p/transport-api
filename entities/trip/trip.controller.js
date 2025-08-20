import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Trip from './trip.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Expense from '../expense/expense.model.js';
import { TRIP_STATUS } from './trip.constants.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';

const createTrip = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { fromDate, remarks } = req.body;

    // 1) Create the new trip (inside txn)
    const trip = new Trip(
      {
        tripStatus: TRIP_STATUS.OPEN,
        fromDate,
        remarks,
        dateOfCreation: new Date(),
        tenant: req.tenant,
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
    const { tripId, subtripId, fromDate, toDate, status } = req.query;

    const { limit, skip } = req.pagination || {};

    const query = addTenantToQuery(req);

    if (tripId) query._id = tripId;
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

// Fetch minimal trip preview with pagination and search
const fetchTripsPreview = asyncHandler(async (req, res) => {
  try {
    const { status } = req.query;
    const { limit, skip } = req.pagination || {};

    const query = { tenant: req.tenant };
    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      query.tripStatus = { $in: statuses };
    }

    const [trips, total] = await Promise.all([
      Trip.find(query)
        .sort({ fromDate: -1 })
        .skip(skip)
        .limit(limit)
        .select("_id fromDate tripStatus"),
      Trip.countDocuments(query),
    ]);

    res.status(200).json({
      trips,
      total,
      startRange: (skip || 0) + 1,
      endRange: (skip || 0) + trips.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching trip previews",
      error: error.message,
    });
  }
});

// fetch All details of trip
const fetchTrip = asyncHandler(async (req, res) => {
  const trip = await Trip.findOne({ _id: req.params.id, tenant: req.tenant })
    .populate({
      path: "subtrips",
      populate: [
        { path: "expenses" },
        { path: "routeCd" },
        { path: "customerId" },
        { path: "driverId" },
        {
          path: "vehicleId",
          populate: { path: "transporter" },
        },
      ],
    });

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
  const trip = await Trip.findOneAndUpdate(
    { _id: tripId, tenant: req.tenant },
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
  const trip = await Trip.findOne({ _id: id, tenant: req.tenant });
  if (!trip) {
    res.status(404);
    throw new Error("Trip not found");
  }

  // 2. Can't update a billed trip at all
  if (trip.tripStatus === TRIP_STATUS.CLOSED) {
    res.status(400);
    throw new Error("Cannot update a closed trip");
  }

  // 3. Perform the update
  const updatedTrip = await Trip.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    req.body,
    {
      new: true,
      runValidators: true,
    }
  );

  res.status(200).json(updatedTrip);
});

// Delete Trip and Associated Subtrips and Expenses
const deleteTrip = asyncHandler(async (req, res) => {
  const trip = await Trip.findOne({ _id: req.params.id, tenant: req.tenant });

  if (!trip) {
    res.status(404).json({ message: "Trip not found" });
    return;
  }

  // Delete all subtrips and their expenses
  for (const subtripId of trip.subtrips) {
    await Expense.deleteMany({ subtripId });
    await Subtrip.findOneAndDelete({ _id: subtripId, tenant: req.tenant });
  }

  await Trip.findOneAndDelete({ _id: req.params.id, tenant: req.tenant });
  res.status(200).json({ message: "Trip deleted successfully" });
});

export { createTrip,
  fetchTrips,
  fetchTripsPreview,
  fetchTrip,
  closeTrip,
  updateTrip,
  deleteTrip, };
