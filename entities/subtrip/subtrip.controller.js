import asyncHandler from 'express-async-handler';
import Trip from '../trip/trip.model.js';
import Subtrip from './subtrip.model.js';
import Driver from '../driver/driver.model.js';
import Expense from '../expense/expense.model.js';
import Vehicle from '../vehicle/vehicle.model.js';
import { TRIP_STATUS } from '../trip/trip.constants.js';
import { SUBTRIP_STATUS } from './subtrip.constants.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
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
    .populate("customerId")
    .populate({
      path: "vehicleId",
      populate: { path: "transporter", model: "Transporter" },
    })
    .populate({ path: "driverId", model: "Driver" })
    .populate("tripId");

// Controller removed: previously created subtrip directly; superseded by createJob

// Fetch Subtrips with flexible querying
const fetchSubtrips = asyncHandler(async (req, res) => {
  try {
    const {
      subtripNo,
      tripId,
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
    // Support partial, case-insensitive search on subtrip number
    if (subtripNo) {
      const escaped = String(subtripNo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.subtripNo = { $regex: escaped, $options: "i" };
    }
    if (tripId) query.tripId = tripId;
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
      customerId,
      subtripStatus,
      referenceSubtripNo,
      loadingPoint,
      unloadingPoint,
      ewayBill,
      driverId,
      vehicleId,
      transporterId,
      vehicleOwnership,
      fromDate,
      toDate,
      subtripEndFromDate,
      subtripEndToDate,
      expiringIn,
      materials,
      subtripType,
    } = req.query;

    const { limit, skip } = req.pagination;

    // Base query with tenant filter
    const query = addTenantToQuery(req);

    // Handle subtripType filter (Default to Loaded/isEmpty:false if not specified or 'Loaded')
    if (subtripType === "Empty") {
      query.isEmpty = true;
    } else {
      query.isEmpty = false;
    }

    if (subtripNo) {
      const escaped = String(subtripNo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.subtripNo = { $regex: escaped, $options: "i" };
    }
    if (customerId) query.customerId = customerId;
    if (referenceSubtripNo) query.referenceSubtripNo = referenceSubtripNo;
    if (loadingPoint) {
      const escaped = String(loadingPoint).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.loadingPoint = { $regex: escaped, $options: "i" };
    }
    if (unloadingPoint) {
      const escaped = String(unloadingPoint).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.unloadingPoint = { $regex: escaped, $options: "i" };
    }
    if (ewayBill) {
      const escaped = String(ewayBill).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.ewayBill = { $regex: escaped, $options: "i" };
    }

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

    if (transporterId || vehicleId || vehicleOwnership) {
      const vehicleSearch = {};
      if (transporterId) vehicleSearch.transporter = transporterId;
      if (vehicleId) vehicleSearch._id = vehicleId;
      if (vehicleOwnership === "Market") vehicleSearch.isOwn = false;
      if (vehicleOwnership === "Own") vehicleSearch.isOwn = true;

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
      // Case-insensitive, partial match across subtripNo, driverName, vehicleNo
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");

      const [drivers, vehicles] = await Promise.all([
        Driver.find({ driverName: { $regex: regex }, tenant: req.tenant }).select(
          "_id"
        ),
        Vehicle.find({ vehicleNo: { $regex: regex }, tenant: req.tenant }).select(
          "_id"
        ),
      ]);

      const driverIds = drivers.map((d) => d._id);
      const vehicleIds = vehicles.map((v) => v._id);

      const orConditions = [{ subtripNo: { $regex: regex } }];
      if (driverIds.length) orConditions.push({ driverId: { $in: driverIds } });
      if (vehicleIds.length) orConditions.push({ vehicleId: { $in: vehicleIds } });

      query.$or = orConditions;
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

// Public: Fetch a single Subtrip by ID (no auth/tenant required)
const fetchSubtripPublic = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const subtrip = await populateSubtrip(Subtrip.findById(id))
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

// Controller removed: material info now handled via createJob

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

// Controller removed: empty subtrip creation superseded by createJob

// Controller removed: empty subtrip close superseded by createJob

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
  fetchSubtrips,
  fetchSubtrip,
  fetchSubtripPublic,
  fetchPaginatedSubtrips,
  updateSubtrip,
  deleteSubtrip,
  receiveLR,
  resolveLR,
  fetchSubtripsByStatuses,
  fetchSubtripsByTransporter,
  exportSubtrips,
};

// Export Subtrips to Excel
const exportSubtrips = asyncHandler(async (req, res) => {
  const {
    subtripNo,
    customerId,
    subtripStatus,
    referenceSubtripNo,
    loadingPoint,
    unloadingPoint,
    ewayBill,
    driverId,
    vehicleId,
    transporterId,
    vehicleOwnership,
    fromDate,
    toDate,
    subtripEndFromDate,
    subtripEndToDate,
    expiringIn,
    materials,
    subtripType,
    columns,
  } = req.query;

  const query = addTenantToQuery(req);

  // Handle subtripType filter (Default to Loaded/isEmpty:false if not specified or 'Loaded')
  if (subtripType === "Empty") {
    query.isEmpty = true;
  } else {
    query.isEmpty = false;
  }

  if (subtripNo) {
    const escaped = String(subtripNo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.subtripNo = { $regex: escaped, $options: "i" };
  }

  // Helper helper to cast to ObjectId safely
  async function toObjectId(id) {
    const { Types } = await import('mongoose');
    if (Types.ObjectId.isValid(id)) return new Types.ObjectId(id);
    return id;
  }

  if (customerId) query.customerId = await toObjectId(customerId);
  if (referenceSubtripNo) query.referenceSubtripNo = referenceSubtripNo;
  if (loadingPoint) {
    const escaped = String(loadingPoint).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.loadingPoint = { $regex: escaped, $options: "i" };
  }
  if (unloadingPoint) {
    const escaped = String(unloadingPoint).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.unloadingPoint = { $regex: escaped, $options: "i" };
  }
  if (ewayBill) {
    const escaped = String(ewayBill).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.ewayBill = { $regex: escaped, $options: "i" };
  }

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
    query.driverId = await toObjectId(driverId);
  }

  if (transporterId || vehicleId || vehicleOwnership) {
    const vehicleSearch = {};
    if (transporterId) vehicleSearch.transporter = await toObjectId(transporterId);
    if (vehicleId) vehicleSearch._id = await toObjectId(vehicleId);
    if (vehicleOwnership === "Market") vehicleSearch.isOwn = false;
    if (vehicleOwnership === "Own") vehicleSearch.isOwn = true;

    const vehicles = await Vehicle.find(addTenantToQuery(req, vehicleSearch)).select("_id");
    if (!vehicles.length) {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
        stream: res,
        useStyles: true,
      });
      const worksheet = workbook.addWorksheet('Jobs');
      worksheet.commit();
      await workbook.commit();
      return;
    }
    query.vehicleId = { $in: vehicles.map((v) => v._id) };
  }

  // Column Mapping
  const COLUMN_MAPPING = {
    _id: { header: 'LR No', key: 'subtripNo', width: 20 },
    tripId: { header: 'Trip No', key: 'tripNo', width: 20 },
    vehicleNo: { header: 'Vehicle No', key: 'vehicleNo', width: 20 },
    driver: { header: 'Driver', key: 'driverName', width: 20 },
    customerId: { header: 'Customer', key: 'customerName', width: 20 },
    route: { header: 'Route', key: 'route', width: 30 },
    invoiceNo: { header: 'Invoice No', key: 'invoiceNo', width: 15 },
    shipmentNo: { header: 'Shipment No', key: 'shipmentNo', width: 15 },
    orderNo: { header: 'Order No', key: 'orderNo', width: 15 },
    referenceSubtripNo: { header: 'Reference Job No', key: 'referenceSubtripNo', width: 20 },
    consignee: { header: 'Consignee', key: 'consignee', width: 20 },
    materialType: { header: 'Material', key: 'materialType', width: 20 },
    quantity: { header: 'Quantity', key: 'quantity', width: 15 },
    grade: { header: 'Grade', key: 'grade', width: 15 },
    startDate: { header: 'Dispatch Date', key: 'startDate', width: 20 },
    endDate: { header: 'Received Date', key: 'endDate', width: 20 },
    ewayExpiryDate: { header: 'E-Way Bill Expiry Date', key: 'ewayExpiryDate', width: 20 },
    loadingPoint: { header: 'Loading Point', key: 'loadingPoint', width: 20 },
    unloadingPoint: { header: 'Unloading Point', key: 'unloadingPoint', width: 20 },
    loadingWeight: { header: 'Loading Weight', key: 'loadingWeight', width: 15 },
    unloadingWeight: { header: 'Unloading Weight', key: 'unloadingWeight', width: 15 },
    shortageWeight: { header: 'Shortage (Weight)', key: 'shortageWeight', width: 15 },
    shortageAmount: { header: 'Shortage (₹)', key: 'shortageAmount', width: 15 },
    rate: { header: 'Rate', key: 'rate', width: 15 },
    freightAmount: { header: 'Freight Amount', key: 'freightAmount', width: 15 },
    commissionRate: { header: 'Commission Rate', key: 'commissionRate', width: 15 },
    expenses: { header: 'Expenses', key: 'totalExpenses', width: 15 },
    profitAndLoss: { header: 'Profit & Loss', key: 'profitAndLoss', width: 15 },
    transport: { header: 'Transporter', key: 'transporterName', width: 20 },
    subtripStatus: { header: 'Job Status', key: 'subtripStatus', width: 15 },
  };

  // Determine Columns
  let exportColumns = [];
  if (columns) {
    const columnIds = columns.split(',');
    exportColumns = columnIds
      .map((id) => COLUMN_MAPPING[id])
      .filter((col) => col);
  }

  // Fallback to default columns
  if (exportColumns.length === 0) {
    exportColumns = Object.values(COLUMN_MAPPING);
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=Jobs.xlsx"
  );

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
  });

  const worksheet = workbook.addWorksheet('Jobs');
  worksheet.columns = exportColumns;

  // AGGREGATION PIPELINE
  const pipeline = [
    { $match: query },
    // Sort
    { $sort: { startDate: -1 } },
    // Lookup Trip
    {
      $lookup: {
        from: 'trips',
        localField: 'tripId',
        foreignField: '_id',
        as: 'trip',
      },
    },
    { $unwind: { path: '$trip', preserveNullAndEmptyArrays: true } },
    // Lookup Customer
    {
      $lookup: {
        from: 'customers',
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer',
      },
    },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    // Lookup Driver
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driver',
      },
    },
    { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },
    // Lookup Vehicle
    {
      $lookup: {
        from: 'vehicles',
        localField: 'vehicleId',
        foreignField: '_id',
        as: 'vehicle',
      },
    },
    { $unwind: { path: '$vehicle', preserveNullAndEmptyArrays: true } },
    // Lookup Transporter (nested in vehicle)
    {
      $lookup: {
        from: 'transporters',
        localField: 'vehicle.transporter',
        foreignField: '_id',
        as: 'transporter',
      },
    },
    { $unwind: { path: '$transporter', preserveNullAndEmptyArrays: true } },
    // Lookup Expenses
    {
      $lookup: {
        from: 'expenses',
        localField: 'expenses',
        foreignField: '_id',
        as: 'expensesData',
      },
    },
    // Project and Calculate
    {
      $project: {
        subtripNo: 1,
        tripNo: '$trip.tripNo',
        vehicleNo: '$vehicle.vehicleNo',
        driverName: '$driver.driverName',
        customerName: '$customer.customerName',
        loadingPoint: 1,
        unloadingPoint: 1,
        invoiceNo: 1,
        shipmentNo: 1,
        orderNo: 1,
        referenceSubtripNo: 1,
        consignee: 1,
        materialType: 1,
        quantity: 1,
        grade: 1,
        startDate: 1,
        endDate: 1,
        ewayExpiryDate: 1,
        loadingWeight: 1,
        unloadingWeight: 1,
        shortageWeight: 1,
        shortageAmount: 1,
        rate: 1,
        freightAmount: 1,
        commissionRate: 1,
        subtripStatus: 1,
        transporterName: '$transporter.transportName',
        // Calculate Total Expenses
        totalExpenses: { $sum: '$expensesData.amount' },
      },
    },
    {
      $addFields: {
        // Calculate Freight
        calculatedFreight: {
          $cond: {
            if: { $ne: [{ $type: '$freightAmount' }, 'missing'] },
            then: '$freightAmount',
            else: { $multiply: ['$rate', '$loadingWeight'] },
          },
        },
      },
    },
    {
      $addFields: {
        // Calculate P&L
        profitAndLoss: { $subtract: ['$calculatedFreight', '$totalExpenses'] },
        // Format route
        route: {
          $concat: [
            { $ifNull: ['$loadingPoint', ''] },
            ' → ',
            { $ifNull: ['$unloadingPoint', ''] }
          ]
        }
      },
    }
  ];

  const cursor = Subtrip.aggregate(pipeline).cursor();

  let totalFreight = 0;
  let totalExpensesSum = 0;
  let totalProfitSum = 0;
  let totalLoadingWeight = 0;
  let totalUnloadingWeight = 0;
  let totalShortageWeight = 0;

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const row = {};

    const freight = doc.calculatedFreight || 0;
    const totalExpenses = doc.totalExpenses || 0;
    const profitAndLoss = doc.profitAndLoss || 0;

    // Accumulate totals
    totalFreight += freight;
    totalExpensesSum += totalExpenses;
    totalProfitSum += profitAndLoss;
    totalLoadingWeight += (doc.loadingWeight || 0);
    totalUnloadingWeight += (doc.unloadingWeight || 0);
    totalShortageWeight += (doc.shortageWeight || 0);

    exportColumns.forEach((col) => {
      const key = col.key;

      if (key === 'freightAmount') row[key] = Math.round(freight * 100) / 100;
      else if (key === 'totalExpenses') row[key] = Math.round(totalExpenses * 100) / 100;
      else if (key === 'profitAndLoss') row[key] = Math.round(profitAndLoss * 100) / 100;
      else if (key === 'startDate' || key === 'endDate' || key === 'ewayExpiryDate') {
        row[key] = doc[key] ? new Date(doc[key]).toISOString().split('T')[0] : '-';
      }
      else if (typeof doc[key] === 'number') {
        row[key] = Math.round(doc[key] * 100) / 100;
      }
      else {
        row[key] = (doc[key] !== undefined && doc[key] !== null) ? doc[key] : '-';
      }
    });

    worksheet.addRow(row).commit();
  }

  // Add Totals Row
  const totalRow = {};
  exportColumns.forEach((col) => {
    const key = col.key;
    if (key === 'subtripNo') totalRow[key] = 'TOTAL';
    else if (key === 'freightAmount') totalRow[key] = Math.round(totalFreight * 100) / 100;
    else if (key === 'totalExpenses') totalRow[key] = Math.round(totalExpensesSum * 100) / 100;
    else if (key === 'profitAndLoss') totalRow[key] = Math.round(totalProfitSum * 100) / 100;
    else if (key === 'loadingWeight') totalRow[key] = Math.round(totalLoadingWeight * 100) / 100;
    else if (key === 'unloadingWeight') totalRow[key] = Math.round(totalUnloadingWeight * 100) / 100;
    else if (key === 'shortageWeight') totalRow[key] = Math.round(totalShortageWeight * 100) / 100;
    else totalRow[key] = '';
  });

  const footerRow = worksheet.addRow(totalRow);
  footerRow.font = { bold: true };
  footerRow.commit();

  worksheet.commit();
  await workbook.commit();
});
