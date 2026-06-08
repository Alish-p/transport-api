import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';

import Subtrip from './subtrip.model.js';
import Trip from '../trip/trip.model.js';
import Driver from '../driver/driver.model.js';
import Tenant from '../tenant/tenant.model.js';
import Expense from '../expense/expense.model.js';
import Vehicle from '../vehicle/vehicle.model.js';
import { TRIP_STATUS } from '../trip/trip.constants.js';
import { SUBTRIP_STATUS } from './subtrip.constants.js';
import Transporter from '../transporter/transporter.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { getStartOfTodayIST } from '../../utils/time-utils.js';
import { recalculateTripFinancials } from '../trip/trip.service.js';
import { EXPENSE_CATEGORIES } from '../expense/expense.constants.js';
import { buildChangedFields } from '../../utils/serialize-field-value.js';
import { recordSubtripEvent } from '../../helpers/subtrip-event-helper.js';
import { FORM_CONFIG_DEFAULTS } from '../formConfig/formConfig.defaults.js';
import { SUBTRIP_EVENT_TYPES } from '../subtripEvent/subtripEvent.constants.js';
import { buildSubtripQuery, resolveSubtripFinancials } from './subtrip.utils.js';
import TransporterAdvance from '../transporterAdvance/transporterAdvance.model.js';
import { resolveChangedFieldLabels } from '../../helpers/resolve-changed-fields.js';
import { buildPublicFileUrl, createPresignedPutUrl } from '../../services/s3.service.js';
import { sendLRGenerationNotification, sendDriverJobAssignedNotification } from '../../services/whatsapp.service.js';

// helper function to Poppulate Subtrip
const populateSubtrip = (query) =>
  query
    .populate({
      path: "expenses",
      populate: [{ path: "pumpCd", model: "Pump" }],
    })
    .populate({
      path: "advances",
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


// Fetch Subtrips with flexible querying
const fetchSubtrips = asyncHandler(async (req, res) => {
  try {
    const { query, hasNoMatchingVehicles } = await buildSubtripQuery(req, req.query);

    if (hasNoMatchingVehicles) {
      return res.status(404).json({
        message: "No vehicles found matching the specified criteria.",
      });
    }

    // Execute the query with population
    const subtrips = await populateSubtrip(Subtrip.find(query)).lean();

    // Attach createdAt for backwards compatibility
    for (const st of subtrips) {
      if (!st.createdAt && st._id) {
        st.createdAt = st._id.getTimestamp();
      }
    }

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
    const { limit, skip } = req.pagination;
    const { query, hasNoMatchingVehicles } = await buildSubtripQuery(req, req.query);

    if (hasNoMatchingVehicles) {
      return res.status(200).json({
        results: [],
        total: 0,
        startRange: 0,
        endRange: 0,
      });
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

    // Attach createdAt for backwards compatibility
    for (const st of subtrips) {
      if (!st.createdAt && st._id) {
        st.createdAt = st._id.getTimestamp();
      }
    }

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
    const { subtripStatus, search, excludeBilled, excludeIsOwn, excludeIsMarket } = req.query;
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

    if (excludeBilled === 'true') {
      query.transporterPaymentReceiptId = null;
    }

    if (excludeIsOwn === 'true') {
      const ownVehicles = await Vehicle.find({ isOwn: true, tenant: req.tenant }).select('_id').lean();
      if (ownVehicles.length > 0) {
        query.vehicleId = { $nin: ownVehicles.map(v => v._id) };
      }
    }

    if (excludeIsMarket === 'true') {
      const marketVehicles = await Vehicle.find({ isOwn: false, tenant: req.tenant }).select('_id').lean();
      if (marketVehicles.length > 0) {
        if (query.vehicleId && query.vehicleId.$nin) {
          query.vehicleId.$nin.push(...marketVehicles.map(v => v._id));
        } else {
          query.vehicleId = { $nin: marketVehicles.map(v => v._id) };
        }
      }
    }

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
      createdAt: st.createdAt || st._id.getTimestamp(),
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

// received Subtrip (LR)
const receiveLR = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    unloadingWeight,
    hasError,
    remarks,
    shortageWeight,
    shortageAmount,
    endDate,
    docs,
  } = req.body;

  const subtrip = await populateSubtrip(
    Subtrip.findOne({ _id: id, tenant: req.tenant })
  );

  if (!subtrip) {
    return res.status(404).json({ message: "Subtrip not found" });
  }

  const { freightDetails, commissionDetails } = resolveSubtripFinancials(subtrip, req.body);

  Object.assign(subtrip, {
    unloadingWeight,
    endDate,
    shortageWeight,
    shortageAmount,
    subtripStatus: hasError ? SUBTRIP_STATUS.ERROR : SUBTRIP_STATUS.RECEIVED,
    remarks,
    commissionDetails,
    freightDetails,
    docs,
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

  // Update Trip Financials
  if (subtrip.tripId) {
    await recalculateTripFinancials(subtrip.tripId, req.tenant);
  }

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

  // Update Trip Financials
  if (subtrip.tripId) {
    await recalculateTripFinancials(subtrip.tripId, req.tenant);
  }

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

  // Check for ewayBill uniqueness if it's being updated
  if (req.body.ewayBill && req.body.ewayBill !== existingSubtrip.ewayBill) {
    const duplicateEwayBill = await Subtrip.findOne({
      tenant: req.tenant,
      ewayBill: req.body.ewayBill,
      _id: { $ne: id }, // Exclude the current subtrip
    });

    if (duplicateEwayBill) {
      return res.status(400).json({ message: "E-way bill already exists" });
    }
  }

  // Recalculate freight and commission if applicable
  const { freightDetails, commissionDetails } = resolveSubtripFinancials(existingSubtrip, req.body);
  req.body.freightDetails = freightDetails;
  req.body.commissionDetails = commissionDetails;

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
  const rawChangedFields = buildChangedFields(existingSubtrip, req.body);
  // Resolve ref IDs → human-readable labels (driver name, customer name, etc.)
  const changedFields = await resolveChangedFieldLabels(rawChangedFields, req.tenant);


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

  // Update Trip Financials if it belongs to a Trip
  if (updatedSubtrip.tripId) {
    await recalculateTripFinancials(updatedSubtrip.tripId, req.tenant);
  }

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

    // 2b. Delete all related advances
    if (subtrip.advances && subtrip.advances.length > 0) {
      await TransporterAdvance.deleteMany({ _id: { $in: subtrip.advances } });
    }

    // 3. Delete the subtrip itself
    await Subtrip.findOneAndDelete({ _id: id, tenant: req.tenant });

    // 4. Remove the deleted subtrip ID from the Trip's `subtrips` array
    const trip = await Trip.findOne({ subtrips: id, tenant: req.tenant });
    if (trip) {
      trip.subtrips.pull(id);
      await trip.save();

      // Ensure updated trip financials are cached
      await recalculateTripFinancials(trip._id, req.tenant);
    }

    res.status(200).json({ message: "Subtrip deleted successfully" });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while deleting the subtrip",
      error: error.message,
    });
  }
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
      .populate("advances")
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

// GET presigned URL for subtrip document upload
const getDocumentUploadUrl = asyncHandler(async (req, res) => {
  const { contentType, fileExtension } = req.query;

  if (!contentType || !fileExtension) {
    res.status(400);
    throw new Error('contentType and fileExtension are required');
  }

  const tenantStr = String(req.tenant);

  const timestamp = Date.now();
  const rand = Math.floor(Math.random() * 10000);

  const s3Key = `logos/subtrips/${tenantStr}/documents/subtrip_${timestamp}_${rand}.${fileExtension}`;

  try {
    const uploadUrl = await createPresignedPutUrl({ key: s3Key, contentType, expiresIn: 900 });

    const base = process.env.AWS_PUBLIC_BASE_URL;
    const publicKey = s3Key.replace(/^logos\//, '');
    const publicUrl = base
      ? `${base.replace(/\/$/, '')}/${publicKey}`
      : (buildPublicFileUrl(s3Key) || null);

    return res.status(200).json({ key: s3Key, uploadUrl, publicUrl });
  } catch (err) {
    console.error('Failed to create subtrip document upload url:', err);
    return res.status(500).json({ message: 'Failed to create upload URL', error: err.message });
  }
});

// Public: Submit EPOD signature (no auth required)
const submitEpod = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { podSignature, podSignedBy, podSigneeMobile, podRemarks, podGeoLocation, podImages } = req.body;

  if (!podSignature || !podSignedBy || !podSigneeMobile) {
    return res.status(400).json({ message: 'Signature, signer name, and mobile number are required' });
  }

  const subtrip = await Subtrip.findById(id).populate('tenant');

  if (!subtrip) {
    return res.status(404).json({ message: 'Job not found' });
  }

  // Check tenant has EPOD enabled
  if (!subtrip.tenant?.integrations?.epod?.enabled) {
    return res.status(403).json({ message: 'epod is not enabled for Your company, Please contact Tranzit team' });
  }

  // Check if already signed
  if (subtrip.podSignature) {
    return res.status(400).json({ message: 'EPOD has already been submitted for this job' });
  }

  // Only allow EPOD for loaded subtrips
  if (subtrip.subtripStatus !== SUBTRIP_STATUS.LOADED) {
    return res.status(400).json({ message: 'EPOD can only be submitted for loaded jobs' });
  }

  // Update POD fields
  Object.assign(subtrip, {
    podSignature,
    podSignedBy,
    podSigneeMobile,
    podSignedAt: new Date(),
    podRemarks: podRemarks || undefined,
    podGeoLocation: podGeoLocation || undefined,
    podImages: podImages || [],
  });

  // Record EPOD event
  await recordSubtripEvent(
    subtrip._id,
    SUBTRIP_EVENT_TYPES.EPOD_SUBMITTED,
    { podSignedBy, podSigneeMobile, podRemarks },
    null, // no user (public)
    subtrip.tenant
  );

  await subtrip.save();

  res.status(200).json({ message: 'EPOD submitted successfully' });
});

// Public: Get presigned URL for EPOD signature upload (no auth required)
const getEpodUploadUrlPublic = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { contentType, fileExtension } = req.query;

  if (!contentType || !fileExtension) {
    return res.status(400).json({ message: 'contentType and fileExtension are required' });
  }

  const subtrip = await Subtrip.findById(id).select('tenant');
  if (!subtrip) {
    return res.status(404).json({ message: 'Job not found' });
  }

  const tenantStr = String(subtrip.tenant);
  const timestamp = Date.now();
  const rand = Math.floor(Math.random() * 10000);
  const s3Key = `logos/subtrips/${tenantStr}/epod/epod_${id}_${timestamp}_${rand}.${fileExtension}`;

  try {
    const uploadUrl = await createPresignedPutUrl({ key: s3Key, contentType, expiresIn: 900 });

    const base = process.env.AWS_PUBLIC_BASE_URL;
    const publicKey = s3Key.replace(/^logos\//, '');
    const publicUrl = base
      ? `${base.replace(/\/$/, '')}/${publicKey}`
      : (buildPublicFileUrl(s3Key) || null);

    return res.status(200).json({ key: s3Key, uploadUrl, publicUrl });
  } catch (err) {
    console.error('Failed to create EPOD upload url:', err);
    return res.status(500).json({ message: 'Failed to create upload URL', error: err.message });
  }
});

// Export Subtrips to Excel
const exportSubtrips = asyncHandler(async (req, res) => {
  const { columns } = req.query;

  const { query, hasNoMatchingVehicles } = await buildSubtripQuery(req, req.query);

  if (hasNoMatchingVehicles) {
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
    ewayBill: { header: 'E-way Bill No', key: 'ewayBill', width: 20 },
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
        driverCellNo: '$driver.driverCellNo',
        customerName: '$customer.customerName',
        loadingPoint: 1,
        unloadingPoint: 1,
        invoiceNo: 1,
        shipmentNo: 1,
        orderNo: 1,
        referenceSubtripNo: 1,
        ewayBill: 1,
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
      const {key} = col;

      if (key === 'freightAmount') row[key] = Math.round(freight * 100) / 100;
      else if (key === 'totalExpenses') row[key] = Math.round(totalExpenses * 100) / 100;
      else if (key === 'profitAndLoss') row[key] = Math.round(profitAndLoss * 100) / 100;
      else if (key === 'startDate' || key === 'endDate' || key === 'ewayExpiryDate') {
        row[key] = doc[key] ? new Date(doc[key]).toISOString().split('T')[0] : '-';
      }
      else if (key === 'driverName') {
        const name = doc[key] || '-';
        row[key] = doc.driverCellNo ? `${name} - ${doc.driverCellNo}` : name;
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
    const {key} = col;
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

// New controller: createJob
// Handles revised flow:
// - Trip is optional and only for own vehicles
// - startKm is moved to Trip level and only captured for "Create New & Close Previous"
// - New Trip's startKm equals previous Trip's endKm (value provided during closing)
// - Market vehicles are always treated as loaded (no empty jobs, no trips)
// - Validations per scenario as described in the request
const createJob = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const now = new Date();
    const {
      vehicleId,
      driverId,
      isEmpty: isEmptyInput,
      // Trip handling inputs (own vehicles only)
      tripDecision: inputTripDecision, // 'attach' | 'new'
      tripId: providedTripId,
      startKm: providedStartKm, // Trip-level start km when creating new & closing previous
      fromDate: fromDateRaw,
      startDate: startDateRaw,
      remarks,

      // Points/party
      loadingPoint: loadingPointInput,
      unloadingPoint: unloadingPointInput,
      customerId,
      consignee,

      // Material
      loadingWeight,
      invoiceNo,
      ewayExpiryDate: ewayExpiryDateRaw,
      materialType,
      ewayBill,
      quantity,
      grade,
      shipmentNo,
      orderNo,
      referenceSubtripNo,
      diNumber,
      freightDetails = {},

      // Optional driver advance inputs
      driverAdvance,
      initialAdvanceDiesel,
      initialAdvanceDieselUnit,
      driverAdvanceGivenBy,
      pumpCd,

      // Misc
      remarks: subtripRemarks,
    } = req.body;

    // Normalize dates
    const startDate = startDateRaw ? new Date(startDateRaw) : null;
    const fromDate = fromDateRaw ? new Date(fromDateRaw) : startDate;
    const ewayExpiryDate = ewayExpiryDateRaw ? new Date(ewayExpiryDateRaw) : null;

    // Basic presence checks
    if (!vehicleId) {
      const err = new Error('vehicleId is required');
      err.status = 400;
      throw err;
    }
    if (!driverId) {
      const err = new Error('driverId is required');
      err.status = 400;
      throw err;
    }
    if (!startDate) {
      const err = new Error('startDate is required');
      err.status = 400;
      throw err;
    }

    // Date validations
    if (startDate > now) {
      const err = new Error('startDate cannot be in the future');
      err.status = 400;
      throw err;
    }

    // Fetch vehicle
    const vehicle = await Vehicle.findOne({ _id: vehicleId, tenant: req.tenant }).session(session);
    if (!vehicle) {
      const err = new Error('Vehicle not found');
      err.status = 404;
      throw err;
    }
    if (!vehicle.isActive) {
      const err = new Error('Cannot create a job for an inactive vehicle');
      err.status = 400;
      throw err;
    }

    // Determine scenario: market vs own
    const isOwnVehicle = !!vehicle.isOwn;

    // Market vehicles cannot be empty and do not use trips
    if (!isOwnVehicle) {
      if (isEmptyInput) {
        const err = new Error('Market vehicle jobs cannot be empty');
        err.status = 400;
        throw err;
      }

      // Block trip-specific inputs for market vehicles to avoid confusion
      if (inputTripDecision || providedTripId || typeof providedStartKm !== 'undefined') {
        const err = new Error('Trips are not used for market vehicles');
        err.status = 400;
        throw err;
      }
    }

    // Validate loaded/market required fields
    const isLoaded = !isEmptyInput || !isOwnVehicle; // market treated as loaded

    const fieldsConfig = req.formConfig?.fields || FORM_CONFIG_DEFAULTS.job_create.fields;
    const isFieldRequired = (name) => {
      const visibility = fieldsConfig?.[name]?.visibility;
      if (visibility === 'required') return true;
      if (visibility === 'optional' || visibility === 'hidden') return false;
      // Fallback defaults
      if (['loadingPoint', 'unloadingPoint', 'consignee', 'loadingWeight', 'invoiceNo', 'materialType'].includes(name)) {
        return true;
      }
      return false;
    };

    // Require loading/unloading points explicitly if required by configuration
    if (isFieldRequired('loadingPoint') && !loadingPointInput) {
      const err = new Error('loadingPoint is required');
      err.status = 400;
      throw err;
    }
    if (isFieldRequired('unloadingPoint') && !unloadingPointInput) {
      const err = new Error('unloadingPoint is required');
      err.status = 400;
      throw err;
    }
    const loadingPoint = loadingPointInput;
    const unloadingPoint = unloadingPointInput;

    if (isLoaded) {
      if (!customerId) {
        const err = new Error('customerId is required for loaded/market job');
        err.status = 400;
        throw err;
      }
      if (isFieldRequired('consignee') && (!consignee || !consignee.trim())) {
        const err = new Error('consignee is required for loaded/market job');
        err.status = 400;
        throw err;
      }

      const missingRequiredFields = [];
      ['loadingWeight', 'invoiceNo', 'ewayExpiryDate', 'materialType'].forEach((field) => {
        if (isFieldRequired(field)) {
          const val = req.body[field];
          if (val === undefined || val === null || val === '') {
            missingRequiredFields.push(field);
          }
        }
      });

      if (missingRequiredFields.length > 0) {
        const err = new Error(
          `${missingRequiredFields.join(', ')} are required for loaded/market job`
        );
        err.status = 400;
        throw err;
      }

      // ewayExpiryDate must be today or later if provided
      if (ewayExpiryDate) {
        const startOfToday = getStartOfTodayIST();
        if (ewayExpiryDate < startOfToday) {
          const err = new Error('ewayExpiryDate must be today or later');
          err.status = 400;
          throw err;
        }
      }
    }

    // Trip handling for own vehicles only
    let tripToUse = null;
    let autoClosedEmptySubtripIds = [];
    let tripDecision = inputTripDecision;

    if (isOwnVehicle) {
      // Find active open trips for this vehicle
      const openTrips = await Trip.find({
        vehicleId,
        tenant: req.tenant,
        tripStatus: TRIP_STATUS.OPEN,
      })
        .session(session)
        .exec();

      if (openTrips.length > 1) {
        const err = new Error('Multiple active trips exist for this vehicle. Resolve before continuing.');
        err.status = 409;
        throw err;
      }
      const activeTrip = openTrips[0] || null;

      // Determine default decision when none is provided
      if (!tripDecision) {
        if (activeTrip) {
          const err = new Error('tripDecision is required when an active trip exists (attach or new)');
          err.status = 400;
          throw err;
        } else {
          tripDecision = 'new';
        }
      }

      if (tripDecision === 'attach') {

        // If a specific trip ID provided (e.g. attaching to a closed/billed trip from UI), fetch it
        if (providedTripId && (!activeTrip || String(providedTripId) !== String(activeTrip._id))) {
          const specificTrip = await Trip.findOne({ _id: providedTripId, tenant: req.tenant }).session(
            session
          );
          if (!specificTrip) {
            const err = new Error('Provided tripId not found');
            err.status = 404;
            throw err;
          }
          if (String(specificTrip.vehicleId) !== String(vehicleId)) {
            const err = new Error('Provided trip does not belong to this vehicle');
            err.status = 400;
            throw err;
          }
          tripToUse = specificTrip;
        } else {
          // Default to active trip
          if (!activeTrip) {
            const err = new Error('No active trip to attach for this vehicle');
            err.status = 400;
            throw err;
          }
          tripToUse = activeTrip;
        }
      } else if (tripDecision === 'new') {
        // If there is an active trip, we must close it and require startKm input 
        if (activeTrip) {
          if (typeof providedStartKm !== 'number') {
            const err = new Error('startKm is required when creating new trip and closing previous');
            err.status = 400;
            throw err;
          }

          // Auto-close any empty subtrips still open on the active trip
          const empties = await Subtrip.find({
            tenant: req.tenant,
            tripId: activeTrip._id,
            isEmpty: true,
            subtripStatus: { $ne: SUBTRIP_STATUS.BILLED },
          })
            .session(session)
            .select('_id');

          if (empties.length) {
            await Subtrip.updateMany(
              { tenant: req.tenant, _id: { $in: empties.map((s) => s._id) } },
              { subtripStatus: SUBTRIP_STATUS.BILLED, endDate: new Date(fromDate) },
              { session }
            );
            autoClosedEmptySubtripIds = empties.map((s) => s._id.toString());
          }

          // Close previous trip with endKm = providedStartKm and toDate = now
          activeTrip.tripStatus = TRIP_STATUS.CLOSED;
          activeTrip.toDate = new Date();
          activeTrip.endKm = providedStartKm;
          await activeTrip.save({ session });

          // Create new trip; new trip's startKm equals previous trip's endKm
          const newTrip = new Trip({
            driverId,
            vehicleId,
            tripStatus: TRIP_STATUS.OPEN,
            fromDate,
            startKm: providedStartKm,
            remarks,
            tenant: req.tenant,
          });
          tripToUse = await newTrip.save({ session });
        } else {
          // No active trip: create fresh one; Start km is optional (default 0)
          const newTrip = new Trip({
            driverId,
            vehicleId,
            tripStatus: TRIP_STATUS.OPEN,
            fromDate,
            startKm: typeof providedStartKm === 'number' ? providedStartKm : 0,
            remarks,
            tenant: req.tenant,
          });
          tripToUse = await newTrip.save({ session });
        }
      } else {
        const err = new Error("tripDecision must be 'attach' or 'new'");
        err.status = 400;
        throw err;
      }
    }

    // Build subtrip payload (no startKm/endKm on subtrip now)
    const subtripFields = {
      tenant: req.tenant,
      driverId,
      vehicleId,
      subtripStatus: SUBTRIP_STATUS.LOADED,
      isEmpty: !!(isOwnVehicle ? isEmptyInput : false),
      startDate,
      loadingPoint,
      unloadingPoint,
    };

    if (tripToUse?._id) {
      subtripFields.tripId = tripToUse._id;
    }

    if (isLoaded) {
      // Check for ewayBill uniqueness
      if (ewayBill) {
        const existingSubtrip = await Subtrip.findOne({
          tenant: req.tenant,
          ewayBill,
        }).session(session);

        if (existingSubtrip) {
          const err = new Error('E-way bill already exists');
          err.status = 400;
          throw err;
        }
      }

      // Freight Calculation
      let calculatedFreightAmount = freightDetails.freightAmount;

      if (!freightDetails.freightModel || freightDetails.freightModel === 'per_ton') {
        const parsedRate = Number(freightDetails.rate) || 0;
        const parsedWeight = Number(loadingWeight) || 0;
        calculatedFreightAmount = parsedRate * parsedWeight;
      }

      Object.assign(subtripFields, {
        customerId,
        consignee,
        loadingWeight,
        freightDetails: {
          freightModel: freightDetails.freightModel || 'per_ton',
          rate: freightDetails.rate,
          freightAmount: calculatedFreightAmount,
          baseKm: freightDetails.baseKm,
          startKm: freightDetails.startKm,
          endKm: freightDetails.endKm,
          startTime: (freightDetails.freightModel === 'time_based') ? startDate : freightDetails.startTime,
          endTime: (freightDetails.freightModel === 'time_based') ? undefined : freightDetails.endTime,
        },
        invoiceNo,
        ewayExpiryDate,
        materialType,
        ewayBill,
        quantity,
        grade,
        shipmentNo,
        orderNo,
        referenceSubtripNo,
        diNumber,
        initialAdvanceDiesel,
        initialAdvanceDieselUnit,
        driverAdvanceGivenBy,
      });
      if (pumpCd) subtripFields.intentFuelPump = pumpCd;
    } else if (
      // Empty job: ensure no loaded-only fields mistakenly sent
      customerId ||
      consignee ||
      loadingWeight ||
      invoiceNo ||
      ewayExpiryDate ||
      materialType
    ) {
      const err = new Error('Empty job must not include customer/consignee/material fields');
      err.status = 400;
      throw err;
    }

    if (subtripRemarks) {
      subtripFields.remarks = subtripRemarks;
    }

    const subtrip = new Subtrip(subtripFields);
    const newSubtrip = await subtrip.save({ session });

    // Attach subtrip to trip if present
    if (tripToUse) {
      tripToUse.subtrips.push(newSubtrip._id);
      await tripToUse.save({ session });
    }

    // Only add expenses if explicitly received from UI req
    // Normalize inputs
    const normGivenBy = (driverAdvanceGivenBy || '').toString().toLowerCase();
    const isGivenByPump = normGivenBy.includes('pump'); // handles 'pump' or 'fuel pump'
    const normDieselUnit = (initialAdvanceDieselUnit || '').toString().toLowerCase();

    // Populate fuel intent fields on subtrip
    // - Store initialTripAdvance with driverAdvance value for reference
    const needsSubtripUpdate =
      driverAdvance !== undefined ||
      initialAdvanceDiesel !== undefined ||
      initialAdvanceDieselUnit !== undefined ||
      pumpCd ||
      driverAdvanceGivenBy;
    if (needsSubtripUpdate) {
      const patch = {};
      if (driverAdvance !== undefined) patch.initialTripAdvance = driverAdvance;
      if (initialAdvanceDiesel !== undefined) patch.initialAdvanceDiesel = initialAdvanceDiesel;
      if (initialAdvanceDieselUnit !== undefined) patch.initialAdvanceDieselUnit = initialAdvanceDieselUnit;
      if (driverAdvanceGivenBy)
        patch.driverAdvanceGivenBy = isGivenByPump ? 'Fuel Pump' : 'Self';
      if (pumpCd) patch.intentFuelPump = pumpCd;
      if (Object.keys(patch).length) {
        await Subtrip.updateOne({ _id: newSubtrip._id, tenant: req.tenant }, { $set: patch }, { session });
      }
    }

    const expensesToInsert = [];
    const advancesToInsert = [];

    // Driver Advance: add if > 0
    if (typeof driverAdvance === 'number' && driverAdvance > 0) {
      if (isOwnVehicle) {
        expensesToInsert.push({
          tenant: req.tenant,
          tripId: newSubtrip.tripId,
          subtripId: newSubtrip._id,
          vehicleId,
          amount: driverAdvance,
          expenseType: 'Trip Advance',
          expenseCategory: EXPENSE_CATEGORIES.SUBTRIP,
          remarks: 'Initial advance given to the driver at the time of job loading.',
          paidThrough: isGivenByPump ? 'Pump' : 'Cash',
          pumpCd: isGivenByPump ? pumpCd || null : null,
        });
      } else {
        advancesToInsert.push({
          tenant: req.tenant,
          subtripId: newSubtrip._id,
          vehicleId,
          amount: driverAdvance,
          advanceType: 'Trip Advance',
          remarks: 'Initial advance given to the driver at the time of job loading.',
          paidThrough: isGivenByPump ? 'Pump' : 'Cash',
          pumpCd: isGivenByPump ? pumpCd || null : null,
        });
      }
    }

    // Initial Advance Diesel: if unit is amount, add expense with pumpCd; if litre, don't add
    if (
      typeof initialAdvanceDiesel === 'number' &&
      initialAdvanceDiesel > 0 &&
      normDieselUnit === 'amount'
    ) {
      if (isOwnVehicle) {
        expensesToInsert.push({
          tenant: req.tenant,
          tripId: newSubtrip.tripId,
          subtripId: newSubtrip._id,
          vehicleId,
          amount: initialAdvanceDiesel,
          expenseType: 'Diesel',
          expenseCategory: EXPENSE_CATEGORIES.SUBTRIP,
          remarks: 'Initial advance diesel (amount) from UI',
          paidThrough: 'Pump',
          pumpCd: pumpCd || null,
        });
      } else {
        advancesToInsert.push({
          tenant: req.tenant,
          subtripId: newSubtrip._id,
          vehicleId,
          amount: initialAdvanceDiesel,
          advanceType: 'Diesel',
          remarks: 'Initial advance diesel (amount) from UI',
          paidThrough: 'Pump',
          pumpCd: pumpCd || null,
        });
      }
    }

    if (expensesToInsert.length) {
      const createdExpenses = await Expense.insertMany(expensesToInsert, { session });
      if (!newSubtrip.expenses) newSubtrip.expenses = [];
      newSubtrip.expenses.push(...createdExpenses.map((e) => e._id));
      await newSubtrip.save({ session });
    }

    if (advancesToInsert.length) {
      const createdAdvances = await TransporterAdvance.insertMany(advancesToInsert, { session });
      if (!newSubtrip.advances) newSubtrip.advances = [];
      newSubtrip.advances.push(...createdAdvances.map((a) => a._id));
      await newSubtrip.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    // Events after commit
    await recordSubtripEvent(
      newSubtrip._id,
      SUBTRIP_EVENT_TYPES.CREATED,
      { note: isLoaded ? 'Loaded job created' : 'Empty job created' },
      req.user,
      req.tenant
    );

    if (autoClosedEmptySubtripIds.length) {
      await Promise.all(
        autoClosedEmptySubtripIds.map((sid) =>
          recordSubtripEvent(
            sid,
            SUBTRIP_EVENT_TYPES.STATUS_CHANGED,
            { note: 'Empty subtrip auto-closed when starting new trip', newStatus: SUBTRIP_STATUS.BILLED },
            req.user,
            req.tenant
          )
        )
      );
    }

    const tenantObj = await Tenant.findById(req.tenant);
    const whatsappEnabled = tenantObj?.integrations?.whatsapp?.enabled;
    const epodEnabled = tenantObj?.integrations?.epod?.enabled;

    if (whatsappEnabled) {
      // WhatsApp: Notify transporter on LR generation for market vehicles only
      if (!isOwnVehicle) {
        try {
          let transporterDoc = null;
          if (vehicle?.transporter) {
            transporterDoc = await Transporter.findOne({ _id: vehicle.transporter, tenant: req.tenant });
          }
          await sendLRGenerationNotification({
            tenantId: req.tenant,
            transporter: transporterDoc,
            vehicle,
            subtrip: newSubtrip,
            createdBy: req.user,
          });
        } catch (err) {
          // Non-blocking; log and continue
          console.error('Failed to send LR WhatsApp notification:', err?.message || err);
        }
      }

      // WhatsApp: Notify driver on job assignment (loaded jobs only)
      if (isLoaded && epodEnabled) {
        try {
          await sendDriverJobAssignedNotification({
            tenantId: req.tenant,
            driverId,
            vehicle,
            subtrip: newSubtrip,
          });
        } catch (err) {
          console.error('Failed to send driver WhatsApp notification:', err?.message || err);
        }
      }
    }

    const populatedSubtrip = await newSubtrip.populate('driverId');
    return res.status(201).json(populatedSubtrip);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || 'Internal Server Error' });
  }
});

export {
  receiveLR,
  resolveLR,
  createJob,
  submitEpod,
  fetchSubtrip,
  fetchSubtrips,
  updateSubtrip,
  deleteSubtrip,
  exportSubtrips,
  fetchSubtripPublic,
  getDocumentUploadUrl,
  fetchPaginatedSubtrips,
  getEpodUploadUrlPublic,
  fetchSubtripsByStatuses,
  fetchSubtripsByTransporter,
};
