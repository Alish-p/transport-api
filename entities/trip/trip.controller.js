import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Trip from './trip.model.js';
import Vehicle from '../vehicle/vehicle.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Expense from '../expense/expense.model.js';
import { TRIP_STATUS } from './trip.constants.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';

const createTrip = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { driverId, vehicleId, fromDate, remarks, closePreviousTrips } =
      req.body;

    // 1) If requested, close all existing OPEN trips for this vehicle (inside txn)
    if (closePreviousTrips) {
      await Trip.updateMany(
        { vehicleId, tripStatus: TRIP_STATUS.OPEN, tenant: req.tenant },
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
    const { tripNo, driverId, vehicleId, subtripId, fromDate, toDate, status, isOwn } =
      req.query;

    const { limit, skip } = req.pagination || {};

    const query = addTenantToQuery(req);

    if (tripNo) {
      query.tripNo = tripId;
    }
    if (driverId) query.driverId = driverId;
    // vehicleId will be applied below when considering isOwn as well
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

    // If filtering by ownership and/or specific vehicle, resolve matching vehicles first
    const hasIsOwnFilter = typeof isOwn !== 'undefined';
    if (vehicleId || hasIsOwnFilter) {
      const vehicleSearch = {};
      if (vehicleId) vehicleSearch._id = vehicleId;
      if (hasIsOwnFilter) vehicleSearch.isOwn = isOwn === true || isOwn === 'true';

      const vehicles = await Vehicle.find(addTenantToQuery(req, vehicleSearch)).select('_id');
      if (!vehicles.length) {
        return res.status(200).json({
          trips: [],
          total: 0,
          totalClosed: 0,
          totalOpen: 0,
          startRange: (skip || 0) + 1,
          endRange: (skip || 0),
        });
      }
      query.vehicleId = { $in: vehicles.map(v => v._id) };
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

// Fetch minimal trip preview with pagination and search
const fetchTripsPreview = asyncHandler(async (req, res) => {
  try {
    const { search, status } = req.query;
    const { limit, skip } = req.pagination || {};

    const basePipeline = [
      {
        $lookup: {
          from: "drivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driver",
        },
      },
      { $unwind: "$driver" },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicleId",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      { $unwind: "$vehicle" },
    ];

    const matchStage = { tenant: req.tenant };

    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      matchStage.tripStatus = { $in: statuses };
    }

    if (search) {
      matchStage.$or = [
        { "driver.driverName": { $regex: search, $options: "i" } },
        { "vehicle.vehicleNo": { $regex: search, $options: "i" } },
      ];
    }

    if (Object.keys(matchStage).length) {
      basePipeline.push({ $match: matchStage });
    }

    const projectStage = {
      $project: {
        _id: 1,
        tripNo: 1,
        driverId: {
          driverName: "$driver.driverName",
        },
        vehicleId: {
          vehicleNo: "$vehicle.vehicleNo",
        },
        fromDate: "$fromDate",
        tripStatus: "$tripStatus",
      },
    };

    const dataPipeline = [
      ...basePipeline,
      { $sort: { fromDate: -1 } },
      projectStage,
      { $skip: skip || 0 },
      { $limit: limit || 0 },
    ];

    const countPipeline = [...basePipeline, { $count: "count" }];

    const [trips, countArr] = await Promise.all([
      Trip.aggregate(dataPipeline),
      Trip.aggregate(countPipeline),
    ]);

    const total = countArr[0]?.count || 0;

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
  const trip = await Trip.findOne({ tripNo: req.params.id, tenant: req.tenant })
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
  const tripNo = req.params.id;

  // Find the trip by ID and update it
  const trip = await Trip.findOneAndUpdate(
    { tripNo: tripNo, tenant: req.tenant },
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
  const trip = await Trip.findOne({ tripNo: id, tenant: req.tenant });
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
  const updatedTrip = await Trip.findOneAndUpdate(
    { tripNo: id, tenant: req.tenant },
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

export {
  createTrip,
  fetchTrips,
  fetchTripsPreview,
  fetchTrip,
  closeTrip,
  updateTrip,
  deleteTrip,
};
