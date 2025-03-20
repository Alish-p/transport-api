const asyncHandler = require("express-async-handler");
const Trip = require("../model/Trip");
const Subtrip = require("../model/Subtrip");
const Expense = require("../model/Expense");
const Vehicle = require("../model/Vehicle");
const { recordSubtripEvent } = require("../helpers/subtrip-event-helper");
const { SUBTRIP_STATUS } = require("../constants/status");
const { SUBTRIP_EVENT_TYPES } = require("../constants/event-types");

// helper function to Poppulate Subtrip
const populateSubtrip = (query) => {
  return query
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
        {
          path: "vehicleId",
          model: "Vehicle",
          populate: { path: "transporter", model: "Transporter" },
        },
      ],
    });
};

// Create Subtrip
const createSubtrip = asyncHandler(async (req, res) => {
  const { tripId } = req.body;
  const trip = await Trip.findById(tripId);

  if (!trip) {
    return res.status(404).json({ message: "Trip not found" });
  }

  const subtrip = new Subtrip({
    ...req.body,
    tripId,
    subtripStatus: SUBTRIP_STATUS.IN_QUEUE,
  });

  // Record creation event
  recordSubtripEvent(
    subtrip,
    SUBTRIP_EVENT_TYPES.CREATED,
    { note: "Subtrip created" },
    req.user
  );

  const newSubtrip = await subtrip.save();

  trip.subtrips.push(newSubtrip._id);
  await trip.save();

  res.status(201).json(newSubtrip);
});

// Fetch Subtrips with flexible querying
const fetchSubtrips = asyncHandler(async (req, res) => {
  try {
    const {
      subtripId,
      tripId,
      routeCd,
      customerId,
      subtripStatus,
      invoiceId,
      driverSalaryId,
      driverId,
      vehicleId,
      transporterId,
      fromDate,
      toDate,
    } = req.query;

    console.log({ req: req.query });

    // Initialize base query
    let query = {};
    let tripQuery = {};
    let vehicleQuery = {};

    // Direct field filters
    if (subtripId) query._id = subtripId;
    if (tripId) query.tripId = tripId;
    if (routeCd) query.routeCd = routeCd;
    if (customerId) query.customerId = customerId;
    if (invoiceId) query.invoiceId = invoiceId;
    if (driverSalaryId) query.driverSalaryId = driverSalaryId;

    // Handle status filter (single or array)
    if (subtripStatus) {
      const statusArray = Array.isArray(subtripStatus)
        ? subtripStatus
        : [subtripStatus];
      query.subtripStatus = { $in: statusArray };
    }

    // Date range filter
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

    console.log({ query, tripQuery, vehicleQuery });

    // Execute the query with population
    const subtrips = await populateSubtrip(Subtrip.find(query));

    if (!subtrips.length) {
      return res.status(404).json({
        message: "No subtrips found matching the specified criteria.",
      });
    }

    res.status(200).json(subtrips);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching subtrips",
      error: error.message,
    });
  }
});

// Fetch a single Subtrip by ID
const fetchSubtrip = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const subtrip = await populateSubtrip(Subtrip.findById(id));

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
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
    routeCd,
    loadingPoint,
    unloadingPoint,
  } = req.body;

  const subtrip = await populateSubtrip(Subtrip.findById(id));

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  // Update fields
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
    subtripStatus: SUBTRIP_STATUS.LOADED,
    routeCd,
    loadingPoint,
    unloadingPoint,
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
    vehicleId,
    pumpCd,
  });

  const savedExpense = await driverAdvanceExpense.save();
  subtrip.expenses.push(savedExpense._id);

  // Record the material addition event
  recordSubtripEvent(
    subtrip,
    SUBTRIP_EVENT_TYPES.MATERIAL_ADDED,
    {
      materialType,
      quantity,
      grade,
    },
    req.user
  );

  // Record expense event
  recordSubtripEvent(
    subtrip,
    SUBTRIP_EVENT_TYPES.EXPENSE_ADDED,
    {
      expenseType: "trip-advance",
      amount: driverAdvance,
    },
    req.user
  );

  await subtrip.save();

  const updatedSubtrip = await populateSubtrip(Subtrip.findById(id));
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
    commissionRate,
  } = req.body;

  const subtrip = await populateSubtrip(Subtrip.findById(id));

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  Object.assign(subtrip, {
    unloadingWeight,
    endDate,
    endKm,
    deductedWeight,
    detentionTime,
    subtripStatus: hasError ? SUBTRIP_STATUS.ERROR : SUBTRIP_STATUS.RECEIVED,
    remarks,
    commissionRate,
  });

  // Record appropriate event
  if (hasError) {
    recordSubtripEvent(
      subtrip,
      SUBTRIP_EVENT_TYPES.ERROR_REPORTED,
      { remarks },
      req.user
    );
  } else {
    recordSubtripEvent(
      subtrip,
      SUBTRIP_EVENT_TYPES.RECEIVED,
      { unloadingWeight },
      req.user
    );
  }

  await subtrip.save();
  res.status(200).json(subtrip);
});

// resolve LR
const resolveLR = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { hasError, remarks } = req.body;

  const subtrip = await populateSubtrip(Subtrip.findById(id));

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  // Update fields
  Object.assign(subtrip, {
    hasError,
    subtripStatus: SUBTRIP_STATUS.RECEIVED,
    remarks,
  });

  // Record error resolution event
  recordSubtripEvent(
    subtrip,
    SUBTRIP_EVENT_TYPES.ERROR_RESOLVED,
    { remarks },
    req.user
  );

  await subtrip.save();
  res.status(200).json(subtrip);
});

const closeSubtrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const subtrip = await populateSubtrip(Subtrip.findById(id));

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  // Update subtrip status
  subtrip.subtripStatus = SUBTRIP_STATUS.CLOSED;

  // Record closing event
  recordSubtripEvent(subtrip, SUBTRIP_EVENT_TYPES.CLOSED, {}, req.user);

  await subtrip.save();

  res.status(200).json(subtrip);
});

// Update Subtrip
const updateSubtrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Find the subtrip first to compare changes
  const existingSubtrip = await Subtrip.findById(id);

  if (!existingSubtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  // Find and update the subtrip
  const updatedSubtrip = await Subtrip.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  // Record the update event with changed fields
  const changedFields = {};
  Object.keys(req.body).forEach((key) => {
    if (existingSubtrip[key] !== req.body[key]) {
      changedFields[key] = {
        from: existingSubtrip[key],
        to: req.body[key],
      };
    }
  });

  // Record status change event if status was changed
  if (
    req.body.subtripStatus &&
    existingSubtrip.subtripStatus !== req.body.subtripStatus
  ) {
    recordSubtripEvent(
      updatedSubtrip,
      SUBTRIP_EVENT_TYPES.STATUS_CHANGED,
      {
        oldStatus: existingSubtrip.subtripStatus,
        newStatus: req.body.subtripStatus,
      },
      req.user
    );
  }

  // Record general update event
  recordSubtripEvent(
    updatedSubtrip,
    SUBTRIP_EVENT_TYPES.UPDATED,
    {
      changedFields,
      message: "Subtrip details updated",
    },
    req.user
  );

  res.status(200).json(updatedSubtrip);
});

// Delete Subtrip
const deleteSubtrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Find the subtrip
  const subtrip = await Subtrip.findById(id);

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  // ──────────────────────────────────────────────────────────
  // OPTIONAL: Block deletion if subtrip is closed or has
  // financial references (invoiceId, driverSalaryId, transporterPaymentReceiptId)
  // ──────────────────────────────────────────────────────────
  if (
    subtrip.subtripStatus === SUBTRIP_STATUS.CLOSED ||
    subtrip.invoiceId ||
    subtrip.driverSalaryId ||
    subtrip.transporterPaymentReceiptId
  ) {
    return res.status(400).json({
      message:
        "Cannot delete subtrip because it is closed or has associated financial documents.",
    });
  }

  try {
    // 2. Delete all related expenses
    //    (Subtrip.expenses is an array of expense _ids)
    if (subtrip.expenses && subtrip.expenses.length > 0) {
      await Expense.deleteMany({ _id: { $in: subtrip.expenses } });
    }

    // 3. Delete the subtrip itself
    await Subtrip.findByIdAndDelete(id);

    // 4. Remove the deleted subtrip ID from the Trip's `subtrips` array
    const trip = await Trip.findOne({ subtrips: id });
    if (trip) {
      trip.subtrips.pull(id);
      await trip.save();
    }

    res.status(200).json({ message: "Subtrip deleted successfully" });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while deleting the subtrip",
      error: error.message,
    });
  }
});

// Add Expense to Subtrip
const addExpenseToSubtrip = asyncHandler(async (req, res) => {
  const { id: subtripId } = req.params;

  // Fetch the subtrip with necessary population
  const subtrip = await populateSubtrip(Subtrip.findById(subtripId));

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  try {
    // Create the new expense
    const expenseData = {
      ...req.body,
      subtripId,
      tripId: subtrip.tripId,
      expenseCategory: "subtrip",
    };

    const newExpense = await new Expense(expenseData).save();

    // Add the expense to the subtrip
    subtrip.expenses.push(newExpense._id);

    // Record expense event
    recordSubtripEvent(
      subtrip,
      SUBTRIP_EVENT_TYPES.EXPENSE_ADDED,
      {
        expenseType: expenseData.expenseType,
        amount: expenseData.amount,
      },
      req.user
    );

    await subtrip.save();

    res.status(201).json(newExpense);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while adding the expense to the subtrip",
      error: error.message,
    });
  }
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
  closeSubtrip,
};
