const asyncHandler = require("express-async-handler");
const Trip = require("../model/Trip");
const Subtrip = require("../model/Subtrip");
const Expense = require("../model/Expense");
const Vehicle = require("../model/Vehicle");

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
  const { tripId } = req.params;
  const trip = await Trip.findById(tripId);

  if (!trip) {
    return res.status(404).json({ message: "Trip not found" });
  }

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

// Fetch all Subtrips
const fetchSubtrips = asyncHandler(async (req, res) => {
  const subtrips = await populateSubtrip(Subtrip.find());
  res.status(200).json(subtrips);
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
    subtripStatus: "loaded",

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
    subtripStatus: hasError ? "error" : "received",
    remarks,
  });

  await subtrip.save();
  res.status(200).json(subtrip);
});

// received Subtrip (LR)
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
    subtripStatus: "received",
    remarks,
  });

  await subtrip.save();
  res.status(200).json(subtrip);
});

const CloseSubtrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const subtrip = await populateSubtrip(Subtrip.findById(id));

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  // Update subtrip status
  subtrip.subtripStatus = "closed";
  await subtrip.save();

  res.status(200).json(subtrip);
});

// Update Subtrip
const updateSubtrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Find and update the subtrip
  const updatedSubtrip = await Subtrip.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true, // Ensures input data is validated
  });

  if (!updatedSubtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  res.status(200).json(updatedSubtrip);
});

// Delete Subtrip
const deleteSubtrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Find the subtrip
  const subtrip = await Subtrip.findById(id);

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  try {
    // Delete related expenses
    await Expense.deleteMany({ _id: { $in: subtrip.expenses } });

    // Delete the subtrip itself
    await Subtrip.findByIdAndDelete(id);

    // Update the associated trip to remove the deleted subtrip
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
    await subtrip.save();

    res.status(201).json(newExpense);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while adding the expense to the subtrip",
      error: error.message,
    });
  }
});

// Customers Trips completed for Invoice Billing
const fetchClosedTripsByCustomerAndDate = asyncHandler(async (req, res) => {
  const { customerId, fromDate, toDate } = req.body;

  try {
    // Fetch closed subtrips for the customer in the given date range
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
        populate: { path: "vehicleId" },
      });

    if (!closedSubtrips.length) {
      return res
        .status(404)
        .json({ message: "No closed trips found for the specified criteria." });
    }

    res.status(200).json(closedSubtrips);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching closed trips",
      error: error.message,
    });
  }
});

// Trips Completed By driver for Payslip
const fetchTripsCompletedByDriverAndDate = asyncHandler(async (req, res) => {
  const { driverId, fromDate, toDate } = req.body;

  try {
    // Find trips associated with the driver
    const trips = await Trip.find({
      driverId: driverId,
    }).select("_id");

    console.log({ trips });

    const tripIds = trips.map((trip) => trip._id);

    // Fetch completed subtrips that belong to the found trips and match date range
    const completedSubtrips = await Subtrip.find({
      subtripStatus: { $in: ["closed", "billed"] },
      tripId: { $in: tripIds },
      startDate: {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      }, // Match subtrips within date range
    })
      .populate({
        path: "tripId",
        populate: { path: "vehicleId driverId" },
      })
      .populate("routeCd")
      .populate("expenses");

    if (!completedSubtrips.length) {
      return res.status(404).json({
        message: "No completed trips found for the specified criteria.",
      });
    }

    res.status(200).json(completedSubtrips);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching trips for the driver",
      error: error.message,
    });
  }
});

// Trips Completed By transporter for Payslip
const fetchClosedSubtripsByTransporterAndDate = asyncHandler(
  async (req, res) => {
    const { transporterId, fromDate, toDate } = req.body;

    try {
      // Fetch vehicles that belong to the transporter (isOwn false or matching transporterId)
      const vehicles = await Vehicle.find({
        $or: [{ isOwn: false, transporter: transporterId }, { isOwn: true }],
      }).select("_id");

      if (!vehicles.length) {
        return res.status(404).json({
          message: "No vehicles found for the specified transporter.",
        });
      }

      // Fetch trips for these vehicles
      const trips = await Trip.find({
        vehicleId: { $in: vehicles.map((v) => v._id) },
      })
        .select("_id")
        .populate("vehicleId");

      if (!trips.length) {
        return res.status(404).json({
          message: "No trips found for the specified vehicles.",
        });
      }

      // Fetch closed subtrips for these trips within the date range
      const closedSubtrips = await Subtrip.find({
        subtripStatus: "closed",
        startDate: {
          $gte: new Date(fromDate),
          $lte: new Date(toDate),
        },
        tripId: { $in: trips.map((t) => t._id) },
      })
        .populate("routeCd")
        .populate("expenses")
        .populate({
          path: "tripId",
          populate: {
            path: "vehicleId",
            populate: { path: "transporter" },
          },
        });

      if (!closedSubtrips.length) {
        return res.status(404).json({
          message: "No closed subtrips found for the specified criteria.",
        });
      }

      res.status(200).json(closedSubtrips);
    } catch (error) {
      res.status(500).json({
        message: "An error occurred while fetching closed subtrips",
        error: error.message,
      });
    }
  }
);

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
  fetchClosedSubtripsByTransporterAndDate,
};
