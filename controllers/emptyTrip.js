const asyncHandler = require("express-async-handler");
const Trip = require("../model/Trip");
const EmptyTrip = require("../model/EmptyTrip");
const { EMPTY_TRIP_STATUS } = require("../constants/status");

// Helper function to populate EmptyTrip
const populateEmptyTrip = (query) => {
  return query.populate("routeCd").populate({
    path: "tripId",
    populate: [
      { path: "driverId", model: "Driver" },
      {
        path: "vehicleId",
        model: "Vehicle",
        populate: { path: "transporter", model: "Transporter" },
      },
    ],
  });
};

// Create EmptyTrip
const createEmptyTrip = asyncHandler(async (req, res) => {
  const { tripId, routeCd, loadingPoint, unloadingPoint, startDate, startKm } =
    req.body;

  // Validate required fields
  if (
    !tripId ||
    !routeCd ||
    !loadingPoint ||
    !unloadingPoint ||
    !startDate ||
    !startKm
  ) {
    return res.status(400).json({
      message:
        "Please provide all required fields: tripId, routeCd, loadingPoint, unloadingPoint, startDate, startKm",
    });
  }

  // Check if trip exists
  const trip = await Trip.findById(tripId);
  if (!trip) {
    return res.status(404).json({ message: "Trip not found" });
  }

  const emptyTrip = new EmptyTrip({
    tripId,
    routeCd,
    loadingPoint,
    unloadingPoint,
    startDate,
    startKm,
    emptyTripStatus: EMPTY_TRIP_STATUS.IN_PROGRESS,
  });

  const newEmptyTrip = await emptyTrip.save();

  // Add emptyTrip reference to the parent trip
  if (!trip.emptyTrips) {
    trip.emptyTrips = [];
  }
  trip.emptyTrips.push(newEmptyTrip._id);
  await trip.save();

  const populatedEmptyTrip = await populateEmptyTrip(
    EmptyTrip.findById(newEmptyTrip._id)
  );
  res.status(201).json(populatedEmptyTrip);
});

// Fetch EmptyTrips with flexible querying
const fetchEmptyTrips = asyncHandler(async (req, res) => {
  try {
    const {
      emptyTripId,
      tripId,
      routeCd,
      emptyTripStatus,
      fromDate,
      toDate,
      driverId,
      vehicleId,
      transporterId,
    } = req.query;

    // Initialize base query
    let query = {};
    let tripQuery = {};
    let vehicleQuery = {};

    // Direct field filters
    if (emptyTripId) query._id = emptyTripId;
    if (tripId) query.tripId = tripId;
    if (routeCd) query.routeCd = routeCd;

    // Handle status filter (single or array)
    if (emptyTripStatus) {
      const statusArray = Array.isArray(emptyTripStatus)
        ? emptyTripStatus
        : [emptyTripStatus];
      query.emptyTripStatus = { $in: statusArray };
    }

    // Date range filters
    if (fromDate && toDate) {
      query.startDate = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    }

    // Handle nested filters (driverId, vehicleId, transporterId)
    if (driverId || vehicleId || transporterId) {
      // Build vehicle query if transporterId is provided
      if (transporterId) {
        vehicleQuery = { isOwn: false, transporter: transporterId };
      }

      // If vehicleId is provided, add it to vehicle query
      if (vehicleId) {
        vehicleQuery._id = vehicleId;
      }

      // Fetch vehicles based on vehicle query
      let vehicles = [];
      if (Object.keys(vehicleQuery).length > 0) {
        vehicles = await Vehicle.find(vehicleQuery).select("_id");
        if (!vehicles.length) {
          return res.status(404).json({
            message: "No vehicles found matching the specified criteria.",
          });
        }
        tripQuery.vehicleId = { $in: vehicles.map((v) => v._id) };
      }

      // Add driverId to trip query if provided
      if (driverId) {
        tripQuery.driverId = driverId;
      }

      // Fetch trips based on trip query
      if (Object.keys(tripQuery).length > 0) {
        const trips = await Trip.find(tripQuery).select("_id");
        if (!trips.length) {
          return res.status(404).json({
            message: "No trips found matching the specified criteria.",
          });
        }
        query.tripId = { $in: trips.map((trip) => trip._id) };
      }
    }

    // Execute the query with population
    const emptyTrips = await populateEmptyTrip(EmptyTrip.find(query));

    if (!emptyTrips.length) {
      return res.status(404).json({
        message: "No empty trips found matching the specified criteria.",
      });
    }

    res.status(200).json(emptyTrips);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching empty trips",
      error: error.message,
    });
  }
});

// Fetch a single EmptyTrip by ID
const fetchEmptyTrip = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const emptyTrip = await populateEmptyTrip(EmptyTrip.findById(id));

  if (!emptyTrip) {
    return res.status(404).json({ message: "Empty trip not found" });
  }

  res.status(200).json(emptyTrip);
});

// Close EmptyTrip
const closeEmptyTrip = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { endDate, endKm } = req.body;

  // Validate required fields
  if (!endDate || !endKm) {
    return res.status(400).json({
      message: "Please provide both endDate and endKm",
    });
  }

  const emptyTrip = await populateEmptyTrip(EmptyTrip.findById(id));

  if (!emptyTrip) {
    return res.status(404).json({ message: "Empty trip not found" });
  }

  // Update empty trip status and end details
  emptyTrip.endDate = endDate;
  emptyTrip.endKm = endKm;
  emptyTrip.emptyTripStatus = EMPTY_TRIP_STATUS.CLOSED;

  await emptyTrip.save();

  res.status(200).json(emptyTrip);
});

// Delete EmptyTrip
const deleteEmptyTrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Find the empty trip
  const emptyTrip = await EmptyTrip.findById(id);

  if (!emptyTrip) {
    return res.status(404).json({ message: "Empty trip not found" });
  }

  // Block deletion if empty trip is closed
  if (emptyTrip.emptyTripStatus === EMPTY_TRIP_STATUS.CLOSED) {
    return res.status(400).json({
      message: "Cannot delete closed empty trip.",
    });
  }

  try {
    // Delete the empty trip
    await EmptyTrip.findByIdAndDelete(id);

    // Remove the deleted empty trip ID from the Trip's `emptyTrips` array
    const trip = await Trip.findOne({ emptyTrips: id });
    if (trip) {
      trip.emptyTrips.pull(id);
      await trip.save();
    }

    res.status(200).json({ message: "Empty trip deleted successfully" });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while deleting the empty trip",
      error: error.message,
    });
  }
});

module.exports = {
  createEmptyTrip,
  fetchEmptyTrips,
  fetchEmptyTrip,
  closeEmptyTrip,
  deleteEmptyTrip,
};
