import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Trip from '../trip/trip.model.js';
import Subtrip from './subtrip.model.js';
import Route from '../route/route.model.js';
import Driver from '../driver/driver.model.js';
import Expense from '../expense/expense.model.js';
import Vehicle from '../vehicle/vehicle.model.js';
import { TRIP_STATUS } from '../trip/trip.constants.js';
import { SUBTRIP_STATUS } from './subtrip.constants.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { EXPENSE_CATEGORIES } from '../expense/expense.constants.js';
import { recordSubtripEvent } from '../../helpers/subtrip-event-helper.js';
import { SUBTRIP_EVENT_TYPES } from '../subtripEvent/subtripEvent.constants.js';


// helper function to Poppulate Subtrip
const populateSubtrip = (query) =>
  query
    .populate({
      path: "expenses",
      populate: [{ path: "pumpCd", model: "Pump" }],
    })
    .populate("intentFuelPump")
    .populate("routeCd")
    .populate("customerId")
    .populate({
      path: "vehicleId",
      populate: { path: "transporter", model: "Transporter" },
    })
    .populate({ path: "driverId", model: "Driver" })
    .populate("tripId");

// Create Subtrip
const createSubtrip = asyncHandler(async (req, res) => {
  const { tripId } = req.body;
  const trip = await Trip.findOne({ _id: tripId, tenant: req.tenant });

  if (!trip) {
    return res.status(404).json({ message: "Trip not found" });
  }

  const subtrip = new Subtrip({
    ...req.body,
    tripId,
    vehicleId: req.body.vehicleId || trip.vehicleId,
    driverId: req.body.driverId || trip.driverId,
    subtripStatus: SUBTRIP_STATUS.IN_QUEUE,
    tenant: req.tenant,
  });

  const newSubtrip = await subtrip.save();

  trip.subtrips.push(newSubtrip._id);
  await trip.save();

  // Record creation event
  await recordSubtripEvent(
    subtrip._id,
    SUBTRIP_EVENT_TYPES.CREATED,
    { note: "Subtrip created" },
    req.user,
    req.tenant
  );

  res.status(201).json(newSubtrip);
});

// Fetch Subtrips with flexible querying
const fetchSubtrips = asyncHandler(async (req, res) => {
  try {
    const {
      subtripNo,
      tripId,
      routeId,
      customerId,
      subtripStatus,
      invoiceId,
      driverSalaryId,
      driverId,
      vehicleId,
      transporterId,
      fromDate,
      toDate,
      ewayExpiryFromDate,
      ewayExpiryToDate,
      subtripEndFromDate,
      subtripEndToDate,
      isEmpty,
      hasInvoice,
      hasDriverSalary,
      hasTransporterPayment,
      materials,
    } = req.query;

    // Initialize base query with tenant filter
    const query = addTenantToQuery(req);

    // Direct field filters
    if (subtripNo) query.subtripNo = subtripNo;
    if (tripId) query.tripId = tripId;
    if (routeId) query.routeCd = new mongoose.Types.ObjectId(routeId);
    if (customerId) query.customerId = customerId;
    if (invoiceId) query.invoiceId = invoiceId;
    if (driverSalaryId) query.driverSalaryId = driverSalaryId;

    // Handle existence filters
    if (hasInvoice !== undefined) {
      query.invoiceId =
        hasInvoice === "true" ? { $exists: true, $ne: null } : null;
    }

    if (hasDriverSalary !== undefined) {
      query.driverSalaryId =
        hasDriverSalary === "true"
          ? { $exists: true, $ne: null }
          : { $exists: false };
    }

    if (hasTransporterPayment !== undefined) {
      query.transporterPaymentReceiptId =
        hasTransporterPayment === "true"
          ? { $exists: true, $ne: null }
          : { $exists: false };
    }

    // Handle isEmpty filter
    if (isEmpty !== undefined) {
      query.isEmpty = isEmpty === "true";
    }
    // Handle status filter (single or array)
    if (subtripStatus) {
      const statusArray = Array.isArray(subtripStatus)
        ? subtripStatus
        : [subtripStatus];
      query.subtripStatus = { $in: statusArray };
    }

    // Handle materials filter (kept case insensitive for now)
    if (materials) {
      const materialsArray = Array.isArray(materials) ? materials : [materials];
      query.materialType = {
        $in: materialsArray.map((mat) => new RegExp(`^${mat}$`, "i")),
      };
    }

    // Date range filters
    if (fromDate && toDate) {
      query.startDate = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    }

    if (ewayExpiryFromDate && ewayExpiryToDate) {
      query.ewayExpiryDate = {
        $gte: new Date(ewayExpiryFromDate),
        $lte: new Date(ewayExpiryToDate),
      };
    }

    if (subtripEndFromDate && subtripEndToDate) {
      query.endDate = {
        $gte: new Date(subtripEndFromDate),
        $lte: new Date(subtripEndToDate),
      };
    }

    // Handle driver, vehicle, and transporter filters
    if (driverId) {
      query.driverId = driverId;
    }

    if (transporterId) {
      const vehicleSearch = { transporter: transporterId };
      if (vehicleId) vehicleSearch._id = vehicleId;
      const vehicles = await Vehicle.find(addTenantToQuery(req, vehicleSearch)).select(
        "_id vehicleNo"
      );
      if (!vehicles.length) {
        return res.status(404).json({
          message: "No vehicles found matching the specified criteria.",
        });
      }
      query.vehicleId = { $in: vehicles.map((v) => v._id) };
    } else if (vehicleId) {
      query.vehicleId = vehicleId;
    }


    // Execute the query with population
    const subtrips = await populateSubtrip(Subtrip.find(query)).lean();

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

// Fetch Subtrips with pagination and search (non-empty only)
const fetchPaginatedSubtrips = asyncHandler(async (req, res) => {
  try {
    const {
      subtripNo,
      routeId,
      customerId,
      subtripStatus,
      referenceSubtripNo,
      driverId,
      vehicleId,
      transporterId,
      isOwn,
      fromDate,
      toDate,
      subtripEndFromDate,
      subtripEndToDate,
      expiringIn,
      materials,
    } = req.query;

    const { limit, skip } = req.pagination;

    // Base query ensures we only consider loaded subtrips and tenant matches
    const query = addTenantToQuery(req, { isEmpty: false });

    if (subtripNo) query.subtripNo = subtripNo;
    if (routeId) query.routeCd = routeId;
    if (customerId) query.customerId = customerId;
    if (referenceSubtripNo) query.referenceSubtripNo = referenceSubtripNo;

    // Status filter (single or array)
    if (subtripStatus) {
      const statusArray = Array.isArray(subtripStatus)
        ? subtripStatus
        : [subtripStatus];
      query.subtripStatus = { $in: statusArray };
    }

    // Material filter
    if (materials) {
      const materialsArray = Array.isArray(materials) ? materials : [materials];
      query.materialType = {
        $in: materialsArray.map((mat) => new RegExp(`^${mat}$`, "i")),
      };
    }

    // Start date range
    if (fromDate || toDate) {
      query.startDate = {};
      if (fromDate) query.startDate.$gte = new Date(fromDate);
      if (toDate) query.startDate.$lte = new Date(toDate);
    }

    // End date range
    if (subtripEndFromDate || subtripEndToDate) {
      query.endDate = {};
      if (subtripEndFromDate) query.endDate.$gte = new Date(subtripEndFromDate);
      if (subtripEndToDate) query.endDate.$lte = new Date(subtripEndToDate);
    }

    // Expiring in hours - only loaded subtrips with expiring/expired ewaybill
    if (expiringIn) {
      const hours = parseInt(expiringIn, 10);
      if (!Number.isNaN(hours)) {
        const threshold = new Date(Date.now() + hours * 60 * 60 * 1000);
        query.ewayExpiryDate = { $ne: null, $lte: threshold };
        query.subtripStatus = SUBTRIP_STATUS.LOADED;
      }
    }

    // Driver/vehicle/transporter/ownership filtering
    if (driverId) {
      query.driverId = driverId;
    }

    const hasIsOwnFilter = typeof isOwn !== "undefined";
    if (transporterId || vehicleId || hasIsOwnFilter) {
      const vehicleSearch = {};
      if (transporterId) vehicleSearch.transporter = transporterId;
      if (vehicleId) vehicleSearch._id = vehicleId;
      if (hasIsOwnFilter) vehicleSearch.isOwn = isOwn === true || isOwn === "true";

      const vehicles = await Vehicle.find(addTenantToQuery(req, vehicleSearch)).select("_id");
      if (!vehicles.length) {
        return res.status(200).json({
          results: [],
          total: 0,
          startRange: 0,
          endRange: 0,
        });
      }
      query.vehicleId = { $in: vehicles.map((v) => v._id) };
    }

    // Fetch data and totals in parallel
    const [subtrips, total, ...statusTotals] = await Promise.all([
      populateSubtrip(
        Subtrip.find(query).sort({ startDate: -1 }).skip(skip).limit(limit)
      ).lean(),
      Subtrip.countDocuments(query),
      ...Object.values(SUBTRIP_STATUS).map((st) =>
        Subtrip.countDocuments({ ...query, subtripStatus: st })
      ),
    ]);

    const totalsObj = {};
    const statusKeys = Object.values(SUBTRIP_STATUS);
    statusTotals.forEach((cnt, idx) => {
      const key = statusKeys[idx]
        .toLowerCase()
        .replace(/-/g, "")
        .replace("billed", "billed")
        .replace("inqueue", "inqueue");
      totalsObj[`total${key.charAt(0).toUpperCase()}${key.slice(1)}`] = cnt;
    });

    res.status(200).json({
      results: subtrips,
      total,
      ...totalsObj,
      startRange: skip + 1,
      endRange: skip + subtrips.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching paginated subtrips",
      error: error.message,
    });
  }
});

// Fetch Subtrips by selected Statuses with optional search and pagination
const fetchSubtripsByStatuses = asyncHandler(async (req, res) => {
  try {
    const { subtripStatus, search } = req.query;
    const { limit, skip } = req.pagination;

    if (
      !subtripStatus ||
      (Array.isArray(subtripStatus) && subtripStatus.length === 0)
    ) {
      return res.status(400).json({ message: "subtripStatus is required" });
    }

    const statusArray = Array.isArray(subtripStatus)
      ? subtripStatus
      : [subtripStatus];

    const query = addTenantToQuery(req, {
      subtripStatus: { $in: statusArray },
      isEmpty: false,
    });

    if (search) {
      if (search.startsWith("st-")) {
        query.subtripNo = search;
      } else {
        const regex = new RegExp(search, "i");

        const [drivers, vehicles] = await Promise.all([
          Driver.find({
            driverName: { $regex: regex },
            tenant: req.tenant,
          }).select("_id"),
          Vehicle.find({
            vehicleNo: { $regex: regex },
            tenant: req.tenant,
          }).select("_id"),
        ]);

        const driverIds = drivers.map((d) => d._id);
        const vehicleIds = vehicles.map((v) => v._id);

        if (!driverIds.length && !vehicleIds.length) {
          return res.status(200).json({
            results: [],
            total: 0,
            startRange: 0,
            endRange: 0,
          });
        }

        const orConditions = [];
        if (driverIds.length) orConditions.push({ driverId: { $in: driverIds } });
        if (vehicleIds.length) orConditions.push({ vehicleId: { $in: vehicleIds } });

        if (!orConditions.length) {
          return res.status(200).json({
            results: [],
            total: 0,
            startRange: 0,
            endRange: 0,
          });
        }

        query.$or = orConditions;
      }
    }

    const [subtrips, total] = await Promise.all([
      Subtrip.find(query)
        .select(
          "_id subtripNo loadingPoint unloadingPoint startDate subtripStatus driverId vehicleId"
        )
        .populate({
          path: "vehicleId",
          select: "vehicleNo isOwn",
        })
        .populate({ path: "driverId", select: "driverName" })
        .skip(skip)
        .limit(limit)
        .lean(),
      Subtrip.countDocuments(query),
    ]);

    const formatted = subtrips.map((st) => ({
      _id: st._id,
      subtripNo: st.subtripNo,
      subtripStatus: st.subtripStatus,
      loadingPoint: st.loadingPoint,
      unloadingPoint: st.unloadingPoint,
      startDate: st.startDate,
      vehicleNo: st.vehicleId?.vehicleNo,
      isOwn: st.vehicleId?.isOwn,
      driverName: st.driverId?.driverName,
    }));

    res.status(200).json({
      results: formatted,
      total,
      startRange: skip + 1,
      endRange: skip + formatted.length,
    });
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

  const subtrip = await populateSubtrip(
    Subtrip.findOne({ _id: id, tenant: req.tenant })
  )
    .populate({ path: "invoiceId", select: "invoiceNo issueDate" })
    .populate({ path: "driverSalaryId", select: "paymentId issueDate" })
    .populate({
      path: "transporterPaymentReceiptId",
      select: "paymentId issueDate",
    });

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  res.status(200).json(subtrip);
});

// Add Material Info to Subtrip
const addMaterialInfo = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
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
      referenceSubtripNo,
      ewayBill,
      ewayExpiryDate,
      tds,
      driverAdvance,
      initialAdvanceDiesel,
      driverAdvanceGivenBy,
      pumpCd,
      vehicleId,
      consignee,
      routeCd,
      loadingPoint,
      unloadingPoint,
    } = req.body;

    const subtrip = await Subtrip.findOne({
      _id: id,
      tenant: req.tenant,
    }).session(session);
    if (!subtrip) throw new Error("Subtrip not found");

    const route = await Route.findOne({
      _id: routeCd,
      tenant: req.tenant,
    }).session(session);
    if (!route) throw new Error("Route not found");

    const vehicle = await Vehicle.findOne({
      _id: vehicleId,
      tenant: req.tenant,
    }).session(session);
    if (!vehicle) throw new Error("Vehicle not found");

    const config = route.vehicleConfiguration.find(
      (item) =>
        item.vehicleType.toLowerCase() === vehicle.vehicleType.toLowerCase() &&
        item.noOfTyres === vehicle.noOfTyres
    );

    const updateData = {
      loadingWeight,
      startKm,
      rate,
      invoiceNo,
      shipmentNo,
      orderNo,
      referenceSubtripNo,
      ewayBill,
      ewayExpiryDate,
      materialType,
      quantity,
      grade,
      tds,
      driverAdvanceGivenBy,
      initialAdvanceDiesel,
      consignee,
      subtripStatus: SUBTRIP_STATUS.LOADED,
      routeCd,
      loadingPoint,
      unloadingPoint,
    };

    if (pumpCd) updateData.intentFuelPump = pumpCd;
    Object.assign(subtrip, updateData);

    const expensesToInsert = [];

    // Only add expenses automatically for owned vehicles
    if (vehicle.isOwn && config) {
      // 1. Fixed or Percentage Driver Salary
      if (config.fixedSalary > 0) {
        expensesToInsert.push({
          tenant: req.tenant,
          tripId: subtrip.tripId,
          subtripId: subtrip._id,
          vehicleId,
          amount: config.fixedSalary,
          expenseType: "Driver Salary",
          expenseCategory: EXPENSE_CATEGORIES.SUBTRIP,
          remarks: "Auto-added fixed driver salary from route config",
          authorisedBy: "System",
          slipNo: "N/A",
          paidThrough: "Cash",
        });
      } else if (config.percentageSalary > 0 && rate > 0 && loadingWeight > 0) {
        const percentAmt =
          (rate * loadingWeight * config.percentageSalary) / 100;
        expensesToInsert.push({
          tenant: req.tenant,
          tripId: subtrip.tripId,
          subtripId: subtrip._id,
          vehicleId,
          amount: percentAmt,
          expenseType: "Driver Salary",
          expenseCategory: EXPENSE_CATEGORIES.SUBTRIP,
          remarks:
            "Auto-calculated percentage-based driver salary from route config",
          authorisedBy: "System",
          slipNo: "N/A",
          paidThrough: "Cash",
        });
      }

      // 2. Toll
      if (config.tollAmt > 0) {
        expensesToInsert.push({
          tenant: req.tenant,
          tripId: subtrip.tripId,
          subtripId: subtrip._id,
          vehicleId,
          amount: config.tollAmt,
          expenseType: "Toll",
          expenseCategory: EXPENSE_CATEGORIES.SUBTRIP,
          remarks: "Auto-added toll from route config",
          authorisedBy: "System",
          slipNo: "N/A",
          paidThrough: "Cash",
        });
      }

      // 3. Route-based Advance
      if (config.advanceAmt > 0) {
        expensesToInsert.push({
          tenant: req.tenant,
          tripId: subtrip.tripId,
          subtripId: subtrip._id,
          vehicleId,
          amount: config.advanceAmt,
          expenseType: "Trip Advance",
          expenseCategory: EXPENSE_CATEGORIES.SUBTRIP,
          remarks: "Auto-added driver advance from route config",
          authorisedBy: "System",
          slipNo: "N/A",
          paidThrough: "Pump",
          pumpCd: driverAdvanceGivenBy === "self" ? null : pumpCd,
        });
      }
    }

    // 4. Manual Advance - Add this regardless of vehicle ownership
    if (driverAdvance && driverAdvance !== 0) {
      expensesToInsert.push({
        tenant: req.tenant,
        tripId: subtrip.tripId,
        subtripId: subtrip._id,
        vehicleId,
        amount: driverAdvance,
        expenseType: "Trip Advance",
        expenseCategory: EXPENSE_CATEGORIES.SUBTRIP,
        remarks: "Manual driver advance entered by user",
        authorisedBy: "System",
        slipNo: "N/A",
        paidThrough: "Pump",
        pumpCd: driverAdvanceGivenBy === "self" ? null : pumpCd,
      });
    }

    // Save all expenses and add references to subtrip
    if (expensesToInsert.length > 0) {
      const createdExpenses = await Expense.insertMany(expensesToInsert, {
        session,
      });

      // Ensure expenses array exists
      if (!subtrip.expenses) {
        subtrip.expenses = [];
      }

      // Add expense IDs to the subtrip's expenses array
      const expenseIds = createdExpenses.map((exp) => exp._id);
      subtrip.expenses.push(...expenseIds);
    }

    // Save subtrip after adding expenses
    await subtrip.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Record material loading event after successful commit
    await recordSubtripEvent(
      subtrip._id,
      SUBTRIP_EVENT_TYPES.MATERIAL_ADDED,
      { materialType, quantity, loadingWeight, rate },
      req.user,
      req.tenant
    );

    // Populate updated subtrip
    const updatedSubtrip = await populateSubtrip(
      Subtrip.findOne({ _id: subtrip._id, tenant: req.tenant })
    );
    res.status(200).json(updatedSubtrip);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Material Info Add Error:", error);
    res.status(500).json({ message: error.message || "Something went wrong" });
  }
});

// received Subtrip (LR)
const receiveLR = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    unloadingWeight,
    commissionRate,
    hasError,
    remarks,
    shortageWeight,
    shortageAmount,
    endDate,
  } = req.body;

  const subtrip = await populateSubtrip(
    Subtrip.findOne({ _id: id, tenant: req.tenant })
  );

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  Object.assign(subtrip, {
    unloadingWeight,
    endDate,
    shortageWeight,
    shortageAmount,
    subtripStatus: hasError ? SUBTRIP_STATUS.ERROR : SUBTRIP_STATUS.RECEIVED,
    remarks,
    commissionRate,
  });

  // Record appropriate event
  if (hasError) {
    await recordSubtripEvent(
      subtrip._id,
      SUBTRIP_EVENT_TYPES.ERROR_REPORTED,
      { remarks },
      req.user,
      req.tenant
    );
  } else {
    await recordSubtripEvent(
      subtrip._id,
      SUBTRIP_EVENT_TYPES.RECEIVED,
      { unloadingWeight },
      req.user,
      req.tenant
    );
  }

  await subtrip.save();

  res.status(200).json(subtrip);
});

// resolve LR
const resolveLR = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { hasError, remarks } = req.body;

  const subtrip = await populateSubtrip(
    Subtrip.findOne({ _id: id, tenant: req.tenant })
  );

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
  await recordSubtripEvent(
    subtrip._id,
    SUBTRIP_EVENT_TYPES.ERROR_RESOLVED,
    { remarks },
    req.user,
    req.tenant
  );

  await subtrip.save();
  res.status(200).json(subtrip);
});

// Update Subtrip
const updateSubtrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Find the subtrip first to compare changes
  const existingSubtrip = await Subtrip.findOne({
    _id: id,
    tenant: req.tenant,
  });

  if (!existingSubtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  // Find and update the subtrip
  const updatedSubtrip = await Subtrip.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    req.body,
    {
      new: true,
      runValidators: true,
    }
  );

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
    await recordSubtripEvent(
      updatedSubtrip._id,
      SUBTRIP_EVENT_TYPES.STATUS_CHANGED,
      {
        oldStatus: existingSubtrip.subtripStatus,
        newStatus: req.body.subtripStatus,
      },
      req.user,
      req.tenant
    );
  }

  // Record general update event
  await recordSubtripEvent(
    updatedSubtrip._id,
    SUBTRIP_EVENT_TYPES.UPDATED,
    {
      changedFields,
      message: "Subtrip details updated",
    },
    req.user,
    req.tenant
  );

  res.status(200).json(updatedSubtrip);
});

// Delete Subtrip
const deleteSubtrip = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Find the subtrip
  const subtrip = await Subtrip.findOne({ _id: id, tenant: req.tenant });

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  // ──────────────────────────────────────────────────────────
  // OPTIONAL: Block deletion if subtrip is Billed or has
  // financial references (invoiceId, driverSalaryId, transporterPaymentReceiptId)
  // ──────────────────────────────────────────────────────────
  if (
    subtrip.subtripStatus === SUBTRIP_STATUS.BILLED ||
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
    await Subtrip.findOneAndDelete({ _id: id, tenant: req.tenant });

    // 4. Remove the deleted subtrip ID from the Trip's `subtrips` array
    const trip = await Trip.findOne({ subtrips: id, tenant: req.tenant });
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

// Create Empty Subtrip
const createEmptySubtrip = asyncHandler(async (req, res) => {
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
  const trip = await Trip.findOne({ _id: tripId, tenant: req.tenant });
  if (!trip) {
    return res.status(404).json({ message: "Trip not found" });
  }

  const subtrip = new Subtrip({
    tripId,
    routeCd,
    driverId: trip.driverId,
    vehicleId: trip.vehicleId,
    loadingPoint,
    unloadingPoint,
    startDate,
    startKm,
    subtripStatus: SUBTRIP_STATUS.IN_QUEUE,
    isEmpty: true, // Mark as empty trip
    tenant: req.tenant,
  });

  const newSubtrip = await subtrip.save();

  // Record creation event
  await recordSubtripEvent(
    newSubtrip._id,
    SUBTRIP_EVENT_TYPES.CREATED,
    { note: "Empty subtrip created" },
    req.user,
    req.tenant
  );

  trip.subtrips.push(newSubtrip._id);
  await trip.save();

  res.status(201).json(newSubtrip);
});

// Close Empty Subtrip
const closeEmptySubtrip = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { endDate, endKm } = req.body;

  // Validate required fields
  if (!endDate || !endKm) {
    return res.status(400).json({
      message: "Please provide both endDate and endKm",
    });
  }

  const subtrip = await populateSubtrip(
    Subtrip.findOne({ _id: id, tenant: req.tenant })
  );

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  // Verify it's an empty trip
  if (!subtrip.isEmpty) {
    return res.status(400).json({ message: "This is not an empty subtrip" });
  }

  // Update subtrip status and end details
  subtrip.endDate = endDate;
  subtrip.endKm = endKm;
  subtrip.subtripStatus = SUBTRIP_STATUS.BILLED;

  // Record closing event
  await recordSubtripEvent(
    subtrip._id,
    SUBTRIP_EVENT_TYPES.BILLED_PAID,
    { note: "Empty subtrip Completed" },
    req.user,
    req.tenant
  );

  await subtrip.save();

  res.status(200).json(subtrip);
});

// Fetch subtrips grouped by transporter with loans for a given date period
const fetchSubtripsByTransporter = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({
      message: "Please provide both startDate and endDate",
    });
  }

  try {
    // Find all subtrips within the date range
    const subtrips = await Subtrip.find({
      tenant: req.tenant,
      startDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
      subtripStatus: {
        $in: [SUBTRIP_STATUS.RECEIVED, SUBTRIP_STATUS.BILLED],
      },
      isEmpty: false,
      transporterPaymentReceiptId: { $exists: false },
    })
      .populate({
        path: "vehicleId",
        populate: { path: "transporter" },
      })
      .populate("expenses")
      .lean();

    // Group subtrips by transporter
    const groupedByTransporter = subtrips.reduce((acc, subtrip) => {
      const transporter = subtrip.vehicleId?.transporter;
      if (!transporter) return acc;

      const transporterId = transporter._id.toString();
      if (!acc[transporterId]) {
        acc[transporterId] = {
          transporter: {
            _id: transporter._id,
            transportName: transporter.transportName,
            address: transporter.address,
            place: transporter.place,
            state: transporter.state,
            pinNo: transporter.pinNo,
            cellNo: transporter.cellNo,
            paymentMode: transporter.paymentMode,
            panNo: transporter.panNo,
            ownerName: transporter.ownerName,
            gstEnabled: transporter.gstEnabled,
            gstNo: transporter.gstNo,
            emailId: transporter.emailId,
            ownerPhoneNo: transporter.ownerPhoneNo,
            tdsPercentage: transporter.tdsPercentage,
            podCharges: transporter.podCharges,
            bankDetails: transporter.bankDetails,
          },
          subtrips: [],
        };
      }
      acc[transporterId].subtrips.push(subtrip);
      return acc;
    }, {});

    // Convert to array format
    const result = Object.values(groupedByTransporter);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching subtrips by transporter",
      error: error.message,
    });
  }
});

export {
  createSubtrip,
  fetchSubtrips,
  fetchSubtrip,
  fetchPaginatedSubtrips,
  updateSubtrip,
  deleteSubtrip,
  addMaterialInfo,
  receiveLR,
  resolveLR,
  createEmptySubtrip,
  closeEmptySubtrip,
  fetchSubtripsByStatuses,
  fetchSubtripsByTransporter,
};
