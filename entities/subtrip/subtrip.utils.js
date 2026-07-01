import dayjs from 'dayjs';
import { Types } from 'mongoose';
import Vehicle from '../vehicle/vehicle.model.js';
import Trip from '../trip/trip.model.js';
import Subtrip from './subtrip.model.js';
import Expense from '../expense/expense.model.js';
import TransporterAdvance from '../transporterAdvance/transporterAdvance.model.js';
import { TRIP_STATUS } from '../trip/trip.constants.js';
import { SUBTRIP_STATUS, FREIGHT_MODELS } from './subtrip.constants.js';
import { EXPENSE_CATEGORIES } from '../expense/expense.constants.js';
import { FIELD_CONFIG_DEFAULTS } from '../fieldConfig/fieldConfig.defaults.js';
import { getStartOfTodayIST } from '../../utils/time-utils.js';

/**
 * Pure calculator function that calculates the gross freight amount of a subtrip.
 * Does not check database state or prioritize stored values.
 * 
 * @param {Object} params - Input parameters
 * @param {String} params.freightModel - Model used
 * @param {Number} params.rate - Rate value
 * @param {Number} params.baseFreight - Base freight for hybrid or fixed models
 * @param {Number} params.loadingWeight - Loaded weight (for per_ton)
 * @param {Date|String} params.startDate - Job start date/time
 * @param {Date|String} params.endDate - Job end date/time
 * @param {Number} params.startKm - KM reading at start
 * @param {Number} params.endKm - KM reading at end
 * @param {Number} params.baseKm - Base KM threshold for hybrid model
 * @returns {Number} Calculated gross freight amount
 */
export const calculateSubtripFreightAmount = ({
  freightModel,
  rate,
  baseFreight = 0,
  loadingWeight = 0,
  startDate,
  endDate,
  startKm = 0,
  endKm = 0,
  baseKm = 0,
}) => {
  const model = freightModel || FREIGHT_MODELS.PER_TON;
  const r = Number(rate) || 0;
  const weight = Number(loadingWeight) || 0;

  if (model === FREIGHT_MODELS.PER_TON || model === FREIGHT_MODELS.PER_KL) {
    return r * weight;
  }

  if (model === FREIGHT_MODELS.PER_KM) {
    const start = Number(startKm) || 0;
    const end = Number(endKm) || 0;
    return end > start ? (end - start) * r : 0;
  }

  if (model === FREIGHT_MODELS.HYBRID) {
    const start = Number(startKm) || 0;
    const end = Number(endKm) || 0;
    const base = Number(baseKm) || 0;
    const totalKm = end > start ? end - start : 0;
    if (totalKm > base && r > 0) {
      const extraKm = totalKm - base;
      return Number(baseFreight) + (extraKm * r);
    }
    return Number(baseFreight);
  }

  if (model === FREIGHT_MODELS.PER_HOUR) {
    if (startDate && endDate) {
      const start = dayjs(startDate);
      const end = dayjs(endDate);
      const diffInHours = Math.ceil(end.diff(start, 'hour', true));
      if (diffInHours > 0) {
        return diffInHours * r;
      }
    }
    return 0;
  }

  if (model === FREIGHT_MODELS.FIXED) {
    return Number(baseFreight);
  }

  return 0;
};

/**
 * Safely casts a string ID to a Mongoose ObjectId.
 * Returns the original value if it's not a valid ObjectId format.
 * 
 * @param {String} id - ID to cast
 * @returns {Types.ObjectId|String} Casted ObjectId or original string
 */
export const toObjectId = (id) => {
  if (id && Types.ObjectId.isValid(id)) {
    return new Types.ObjectId(id);
  }
  return id;
};

/**
 * Builds a query object for Subtrip model based on flexible query parameters.
 * Automatically casts ID fields to ObjectId for compatibility with aggregation pipelines.
 * 
 * @param {Object} req - Express request object containing req.tenant
 * @param {Object} queryParams - Query parameters from req.query
 * @returns {Promise<{query: Object, hasNoMatchingVehicles: Boolean}>} Query object and matching vehicle flag
 */
export const buildSubtripQuery = async (req, queryParams) => {
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
    commissionRateMin,
    commissionRateMax,
    referenceSubtripNo,
    loadingPoint,
    unloadingPoint,
    ewayBill,
    vehicleOwnership,
    expiringIn,
    subtripType,
    transporterPaymentGenerated,
    epodSigned,
    shortage,
    freightModel,
  } = queryParams;

  const query = { tenant: req.tenant };

  // Handle subtripType filter
  if (subtripType === 'Empty') {
    query.isEmpty = true;
  } else if (subtripType === 'Loaded') {
    query.isEmpty = false;
  } else if (isEmpty !== undefined) {
    query.isEmpty = isEmpty === 'true' || isEmpty === true;
  }

  // Direct ID filters (safe cast to ObjectId for aggregation support)
  if (tripId) query.tripId = toObjectId(tripId);
  if (customerId) query.customerId = toObjectId(customerId);
  if (invoiceId) query.invoiceId = toObjectId(invoiceId);
  if (driverSalaryId) query.driverSalaryId = toObjectId(driverSalaryId);
  if (driverId) query.driverId = toObjectId(driverId);
  if (referenceSubtripNo) query.referenceSubtripNo = referenceSubtripNo;

  // Regex string filters
  const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (subtripNo) {
    query.subtripNo = { $regex: escapeRegex(subtripNo), $options: 'i' };
  }
  if (loadingPoint) {
    query.loadingPoint = { $regex: escapeRegex(loadingPoint), $options: 'i' };
  }
  if (unloadingPoint) {
    query.unloadingPoint = { $regex: escapeRegex(unloadingPoint), $options: 'i' };
  }
  if (ewayBill) {
    query.ewayBill = { $regex: escapeRegex(ewayBill), $options: 'i' };
  }

  // Handle existence filters
  if (hasInvoice !== undefined) {
    query.invoiceId = hasInvoice === 'true' || hasInvoice === true
      ? { $exists: true, $ne: null }
      : null;
  }
  if (hasDriverSalary !== undefined) {
    query.driverSalaryId = hasDriverSalary === 'true' || hasDriverSalary === true
      ? { $exists: true, $ne: null }
      : null;
  }
  if (hasTransporterPayment !== undefined) {
    query.transporterPaymentReceiptId = hasTransporterPayment === 'true' || hasTransporterPayment === true
      ? { $exists: true, $ne: null }
      : null;
  }

  // Handle status filter (single or array)
  if (subtripStatus) {
    const statusArray = Array.isArray(subtripStatus) ? subtripStatus : [subtripStatus];
    query.subtripStatus = { $in: statusArray };
  }

  // Handle materials filter
  if (materials) {
    const materialsArray = Array.isArray(materials) ? materials : [materials];
    query.materialType = {
      $in: materialsArray.map((mat) => new RegExp(`^${escapeRegex(mat)}$`, 'i')),
    };
  }

  // Commission Rate filter
  if (commissionRateMin !== undefined || commissionRateMax !== undefined) {
    query['commissionDetails.commissionRate'] = {};
    if (commissionRateMin !== undefined && commissionRateMin !== '') {
      query['commissionDetails.commissionRate'].$gte = Number(commissionRateMin);
    }
    if (commissionRateMax !== undefined && commissionRateMax !== '') {
      query['commissionDetails.commissionRate'].$lte = Number(commissionRateMax);
    }
    if (Object.keys(query['commissionDetails.commissionRate']).length === 0) {
      delete query['commissionDetails.commissionRate'];
    }
  }

  // Date range filters
  if (fromDate || toDate) {
    query.startDate = {};
    if (fromDate) query.startDate.$gte = new Date(fromDate);
    if (toDate) query.startDate.$lte = new Date(toDate);
  }
  if (ewayExpiryFromDate && ewayExpiryToDate) {
    query.ewayExpiryDate = {
      $gte: new Date(ewayExpiryFromDate),
      $lte: new Date(ewayExpiryToDate),
    };
  }
  if (subtripEndFromDate || subtripEndToDate) {
    query.endDate = {};
    if (subtripEndFromDate) query.endDate.$gte = new Date(subtripEndFromDate);
    if (subtripEndToDate) query.endDate.$lte = new Date(subtripEndToDate);
  }

  // Expiring in hours
  if (expiringIn) {
    const hours = parseInt(expiringIn, 10);
    if (!Number.isNaN(hours)) {
      const threshold = new Date(Date.now() + hours * 60 * 60 * 1000);
      query.ewayExpiryDate = { $ne: null, $lte: threshold };
      query.subtripStatus = SUBTRIP_STATUS.LOADED;
    }
  }

  // Transporter payment generated filter (market trips only)
  let transporterPaymentGeneratedFilter = null;
  if (transporterPaymentGenerated) {
    if (transporterPaymentGenerated === 'yes') {
      transporterPaymentGeneratedFilter = { $exists: true, $ne: null };
    } else if (transporterPaymentGenerated === 'no') {
      transporterPaymentGeneratedFilter = null;
    }
  }

  // Driver/vehicle/transporter/ownership filtering
  let hasNoMatchingVehicles = false;
  if (transporterId || vehicleId || vehicleOwnership || transporterPaymentGenerated) {
    const vehicleSearch = {};
    if (transporterId) vehicleSearch.transporter = toObjectId(transporterId);
    if (vehicleId) vehicleSearch._id = toObjectId(vehicleId);
    if (vehicleOwnership === 'Market') vehicleSearch.isOwn = false;
    if (vehicleOwnership === 'Own') vehicleSearch.isOwn = true;
    if (transporterPaymentGenerated && !vehicleOwnership) vehicleSearch.isOwn = false;

    // Fetch matching vehicles
    const vehicles = await Vehicle.find({ ...vehicleSearch, tenant: req.tenant }).select('_id');
    if (!vehicles.length) {
      hasNoMatchingVehicles = true;
      query.vehicleId = { $in: [] };
    } else {
      query.vehicleId = { $in: vehicles.map((v) => v._id) };
    }
  }

  if (transporterPaymentGeneratedFilter !== null) {
    query.transporterPaymentReceiptId = transporterPaymentGeneratedFilter;
  } else if (transporterPaymentGenerated === 'no') {
    query.transporterPaymentReceiptId = null;
  }

  // Epod signed filter
  if (epodSigned === 'yes') {
    query.podSignature = { $exists: true, $ne: null };
  } else if (epodSigned === 'no') {
    query.podSignature = null;
  }

  // Shortage filter
  if (shortage === 'yes') {
    query.$or = [{ shortageWeight: { $gt: 0 } }, { shortageAmount: { $gt: 0 } }];
  } else if (shortage === 'no') {
    query.shortageWeight = { $in: [0, null] };
    query.shortageAmount = { $in: [0, null] };
  }

  if (freightModel) {
    query['freightDetails.freightModel'] = freightModel;
  }

  return { query, hasNoMatchingVehicles };
};

/**
 * Resolves and recalculates freight details and commission details for a subtrip.
 * Consolidates business rules for different freight models (per_ton, hybrid, per_hour, etc.).
 * 
 * @param {Object} subtrip - Existing subtrip document or object
 * @param {Object} updateData - Request body/updates containing updated fields
 * @returns {{freightDetails: Object, commissionDetails: Object}} Resolved freight and commission objects
 */
export const resolveSubtripFinancials = (subtrip, updateData) => {
  let currentFd = {};
  if (subtrip.freightDetails) {
    currentFd = typeof subtrip.freightDetails.toObject === 'function'
      ? subtrip.freightDetails.toObject()
      : subtrip.freightDetails;
  }

  let currentCd = {};
  if (subtrip.commissionDetails) {
    currentCd = typeof subtrip.commissionDetails.toObject === 'function'
      ? subtrip.commissionDetails.toObject()
      : subtrip.commissionDetails;
  }

  const fdToUse = { ...currentFd, ...updateData.freightDetails };
  const cdToUse = { ...currentCd, ...updateData.commissionDetails };

  const weightToUse = Number(updateData.loadingWeight !== undefined ? updateData.loadingWeight : subtrip.loadingWeight) || 0;
  const startDateToUse = updateData.startDate !== undefined ? updateData.startDate : subtrip.startDate;
  const endDateToUse = updateData.endDate !== undefined ? updateData.endDate : subtrip.endDate;

  const model = fdToUse.freightModel || FREIGHT_MODELS.PER_TON;

  // Recalculate freight amount
  if (model === FREIGHT_MODELS.PER_TON || model === FREIGHT_MODELS.PER_KL || model === FREIGHT_MODELS.PER_KM || model === FREIGHT_MODELS.PER_HOUR || model === FREIGHT_MODELS.FIXED) {
    const expectedFreight = calculateSubtripFreightAmount({
      ...fdToUse,
      loadingWeight: weightToUse,
      baseFreight: 0,
      startDate: startDateToUse,
      endDate: endDateToUse,
    });

    let freightAmountToStore = expectedFreight;
    if (updateData.freightDetails && updateData.freightDetails.freightAmount !== undefined) {
      const submittedAmount = Number(updateData.freightDetails.freightAmount) || 0;
      if (Math.abs(submittedAmount - expectedFreight) > 0.01) {
        freightAmountToStore = submittedAmount; // User override
      }
    }

    fdToUse.freightAmount = freightAmountToStore;
  } else if (model === FREIGHT_MODELS.HYBRID) {
    const baseFreight = Number(currentFd.freightAmount) || 0;
    const expectedFreight = calculateSubtripFreightAmount({
      ...fdToUse,
      loadingWeight: weightToUse,
      baseFreight,
      startDate: startDateToUse,
      endDate: endDateToUse,
    });

    let freightAmountToStore = expectedFreight;
    if (updateData.freightDetails && updateData.freightDetails.freightAmount !== undefined) {
      const submittedAmount = Number(updateData.freightDetails.freightAmount) || 0;
      if (Math.abs(submittedAmount - expectedFreight) > 0.01) {
        freightAmountToStore = submittedAmount;
      }
    }

    fdToUse.freightAmount = freightAmountToStore;
  }

  // Recalculate commission details
  if (model === FREIGHT_MODELS.PER_TON || model === FREIGHT_MODELS.PER_KL) {
    if (cdToUse.commissionRate !== undefined && cdToUse.commissionRate !== null && cdToUse.commissionRate !== '') {
      cdToUse.commissionAmount = Number(cdToUse.commissionRate) * weightToUse;
    }
  }

  return { freightDetails: fdToUse, commissionDetails: cdToUse };
};

/**
 * Validates the inputs for creating a new job.
 */
export const validateJobCreateInput = ({ body, vehicle, formConfig }) => {
  const now = new Date();
  const startDate = body.startDate ? new Date(body.startDate) : null;
  const ewayExpiryDate = body.ewayExpiryDate ? new Date(body.ewayExpiryDate) : null;

  if (!body.vehicleId) {
    const err = new Error('vehicleId is required');
    err.status = 400;
    throw err;
  }
  if (!body.driverId) {
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

  const isOwnVehicle = !!vehicle.isOwn;

  // Market vehicles cannot be empty and do not use trips
  if (!isOwnVehicle) {
    if (body.isEmpty) {
      const err = new Error('Market vehicle jobs cannot be empty');
      err.status = 400;
      throw err;
    }

    // Block trip-specific inputs for market vehicles to avoid confusion
    if (body.tripDecision || body.tripId || typeof body.startKm !== 'undefined') {
      const err = new Error('Trips are not used for market vehicles');
      err.status = 400;
      throw err;
    }
  }

  // Validate loaded/market required fields
  const isLoaded = !body.isEmpty || !isOwnVehicle; // market treated as loaded

  const fieldsConfig = formConfig?.fields || FIELD_CONFIG_DEFAULTS.subtrip.fields;
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

  if (isFieldRequired('loadingPoint') && !body.loadingPoint) {
    const err = new Error('loadingPoint is required');
    err.status = 400;
    throw err;
  }
  if (isFieldRequired('unloadingPoint') && !body.unloadingPoint) {
    const err = new Error('unloadingPoint is required');
    err.status = 400;
    throw err;
  }

  if (isLoaded) {
    if (!body.customerId) {
      const err = new Error('customerId is required for loaded/market job');
      err.status = 400;
      throw err;
    }
    if (isFieldRequired('consignee') && (!body.consignee || !body.consignee.trim())) {
      const err = new Error('consignee is required for loaded/market job');
      err.status = 400;
      throw err;
    }

    const missingRequiredFields = [];
    ['loadingWeight', 'invoiceNo', 'ewayExpiryDate', 'materialType'].forEach((field) => {
      if (isFieldRequired(field)) {
        if (field === 'loadingWeight' && body.freightDetails?.freightModel !== 'per_ton' && body.freightDetails?.freightModel !== 'per_kl') {
          return;
        }
        const val = body[field];
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
};

/**
 * Resolves or creates a Trip for the job if it is an own vehicle.
 */
export const resolveTripForJob = async ({ vehicle, body, session, tenant }) => {
  const isOwnVehicle = !!vehicle.isOwn;
  if (!isOwnVehicle) {
    return { tripToUse: null, autoClosedEmptySubtripIds: [] };
  }

  const startDate = body.startDate ? new Date(body.startDate) : null;
  const fromDate = body.fromDate ? new Date(body.fromDate) : startDate;

  // Find active open trips for this vehicle
  const openTrips = await Trip.find({
    vehicleId: vehicle._id,
    tenant,
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

  let tripDecision = body.tripDecision;
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

  let tripToUse = null;
  let autoClosedEmptySubtripIds = [];

  if (tripDecision === 'attach') {
    // If a specific trip ID provided (e.g. attaching to a closed/billed trip from UI), fetch it
    if (body.tripId && (!activeTrip || String(body.tripId) !== String(activeTrip._id))) {
      const specificTrip = await Trip.findOne({ _id: body.tripId, tenant }).session(session);
      if (!specificTrip) {
        const err = new Error('Provided tripId not found');
        err.status = 404;
        throw err;
      }
      if (String(specificTrip.vehicleId) !== String(vehicle._id)) {
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
      if (typeof body.startKm !== 'number') {
        const err = new Error('startKm is required when creating new trip and closing previous');
        err.status = 400;
        throw err;
      }

      // Auto-close any empty subtrips still open on the active trip
      const empties = await Subtrip.find({
        tenant,
        tripId: activeTrip._id,
        isEmpty: true,
        subtripStatus: { $ne: SUBTRIP_STATUS.BILLED },
      })
        .session(session)
        .select('_id');

      if (empties.length) {
        await Subtrip.updateMany(
          { tenant, _id: { $in: empties.map((s) => s._id) } },
          { subtripStatus: SUBTRIP_STATUS.BILLED, endDate: new Date(fromDate) },
          { session }
        );
        autoClosedEmptySubtripIds = empties.map((s) => s._id.toString());
      }

      // Close previous trip with endKm = body.startKm and toDate = now
      activeTrip.tripStatus = TRIP_STATUS.CLOSED;
      activeTrip.toDate = new Date();
      activeTrip.endKm = body.startKm;
      await activeTrip.save({ session });

      // Create new trip; new trip's startKm equals previous trip's endKm
      const newTrip = new Trip({
        driverId: body.driverId,
        vehicleId: vehicle._id,
        tripStatus: TRIP_STATUS.OPEN,
        fromDate,
        startKm: body.startKm,
        remarks: body.remarks,
        tenant,
      });
      tripToUse = await newTrip.save({ session });
    } else {
      // No active trip: create fresh one; Start km is optional (default 0)
      const newTrip = new Trip({
        driverId: body.driverId,
        vehicleId: vehicle._id,
        tripStatus: TRIP_STATUS.OPEN,
        fromDate,
        startKm: typeof body.startKm === 'number' ? body.startKm : 0,
        remarks: body.remarks,
        tenant,
      });
      tripToUse = await newTrip.save({ session });
    }
  } else {
    const err = new Error("tripDecision must be 'attach' or 'new'");
    err.status = 400;
    throw err;
  }

  return { tripToUse, autoClosedEmptySubtripIds };
};

/**
 * Builds the subtrip fields configuration object based on input.
 */
export const buildSubtripPayload = ({ body, vehicle, tripToUse, tenant, isOwnVehicle, isLoaded }) => {
  const startDate = body.startDate ? new Date(body.startDate) : null;
  const ewayExpiryDate = body.ewayExpiryDate ? new Date(body.ewayExpiryDate) : null;
  const loadingPoint = body.loadingPoint;
  const unloadingPoint = body.unloadingPoint;
  const freightDetails = body.freightDetails || {};

  const subtripFields = {
    tenant,
    driverId: body.driverId,
    vehicleId: vehicle._id,
    subtripStatus: SUBTRIP_STATUS.LOADED,
    isEmpty: !!(isOwnVehicle ? body.isEmpty : false),
    startDate,
    loadingPoint,
    unloadingPoint,
  };

  if (tripToUse?._id) {
    subtripFields.tripId = tripToUse._id;
  }

  if (isLoaded) {
    // Freight Calculation
    let calculatedFreightAmount = freightDetails.freightAmount;

    if (!freightDetails.freightModel || freightDetails.freightModel === FREIGHT_MODELS.PER_TON || freightDetails.freightModel === FREIGHT_MODELS.PER_KL) {
      const parsedRate = Number(freightDetails.rate) || 0;
      const parsedWeight = Number(body.loadingWeight) || 0;
      calculatedFreightAmount = parsedRate * parsedWeight;
    }

    Object.assign(subtripFields, {
      customerId: body.customerId,
      consignee: body.consignee,
      loadingWeight: body.loadingWeight,
      freightDetails: {
        freightModel: freightDetails.freightModel || FREIGHT_MODELS.PER_TON,
        rate: freightDetails.rate,
        freightAmount: calculatedFreightAmount,
        baseKm: freightDetails.baseKm,
        startKm: freightDetails.startKm,
        endKm: freightDetails.endKm,
        startTime: (freightDetails.freightModel === FREIGHT_MODELS.PER_HOUR) ? startDate : freightDetails.startTime,
        endTime: (freightDetails.freightModel === FREIGHT_MODELS.PER_HOUR) ? undefined : freightDetails.endTime,
      },
      invoiceNo: body.invoiceNo,
      ewayExpiryDate,
      materialType: body.materialType,
      ewayBill: body.ewayBill,
      quantity: body.quantity,
      grade: body.grade,
      shipmentNo: body.shipmentNo,
      orderNo: body.orderNo,
      referenceSubtripNo: body.referenceSubtripNo,
      diNumber: body.diNumber,
      initialAdvanceDiesel: body.initialAdvanceDiesel,
      initialAdvanceDieselUnit: body.initialAdvanceDieselUnit,
      driverAdvanceGivenBy: body.driverAdvanceGivenBy,
    });
    if (body.pumpCd) subtripFields.intentFuelPump = body.pumpCd;
  } else if (
    // Empty job: ensure no loaded-only fields mistakenly sent
    body.customerId ||
    body.consignee ||
    body.loadingWeight ||
    body.invoiceNo ||
    body.ewayExpiryDate ||
    body.materialType
  ) {
    const err = new Error('Empty job must not include customer/consignee/material fields');
    err.status = 400;
    throw err;
  }

  if (body.remarks) {
    subtripFields.remarks = body.remarks;
  }

  return subtripFields;
};

/**
 * Handles driver advances and advance diesel expenses/advances creation.
 */
export const handleJobAdvancesAndExpenses = async ({ newSubtrip, body, vehicleId, isOwnVehicle, session, tenant }) => {
  const normGivenBy = (body.driverAdvanceGivenBy || '').toString().toLowerCase();
  const isGivenByPump = normGivenBy.includes('pump');
  const normDieselUnit = (body.initialAdvanceDieselUnit || '').toString().toLowerCase();

  const needsSubtripUpdate =
    body.driverAdvance !== undefined ||
    body.initialAdvanceDiesel !== undefined ||
    body.initialAdvanceDieselUnit !== undefined ||
    body.pumpCd ||
    body.driverAdvanceGivenBy;

  if (needsSubtripUpdate) {
    const patch = {};
    if (body.driverAdvance !== undefined) patch.initialTripAdvance = body.driverAdvance;
    if (body.initialAdvanceDiesel !== undefined) patch.initialAdvanceDiesel = body.initialAdvanceDiesel;
    if (body.initialAdvanceDieselUnit !== undefined) patch.initialAdvanceDieselUnit = body.initialAdvanceDieselUnit;
    if (body.driverAdvanceGivenBy)
      patch.driverAdvanceGivenBy = isGivenByPump ? 'Fuel Pump' : 'Self';
    if (body.pumpCd) patch.intentFuelPump = body.pumpCd;
    if (Object.keys(patch).length) {
      await Subtrip.updateOne({ _id: newSubtrip._id, tenant }, { $set: patch }, { session });
    }
  }

  const expensesToInsert = [];
  const advancesToInsert = [];

  // Driver Advance: add if > 0
  if (typeof body.driverAdvance === 'number' && body.driverAdvance > 0) {
    if (isOwnVehicle) {
      expensesToInsert.push({
        tenant,
        tripId: newSubtrip.tripId,
        subtripId: newSubtrip._id,
        vehicleId,
        amount: body.driverAdvance,
        expenseType: 'Trip Advance',
        expenseCategory: EXPENSE_CATEGORIES.SUBTRIP,
        remarks: 'Initial advance given to the driver at the time of job loading.',
        paidThrough: isGivenByPump ? 'Pump' : 'Cash',
        pumpCd: isGivenByPump ? body.pumpCd || null : null,
      });
    } else {
      advancesToInsert.push({
        tenant,
        subtripId: newSubtrip._id,
        vehicleId,
        amount: body.driverAdvance,
        advanceType: 'Trip Advance',
        remarks: 'Initial advance given to the driver at the time of job loading.',
        paidThrough: isGivenByPump ? 'Pump' : 'Cash',
        pumpCd: isGivenByPump ? body.pumpCd || null : null,
      });
    }
  }

  // Initial Advance Diesel: if unit is amount, add expense with pumpCd; if litre, don't add
  if (
    typeof body.initialAdvanceDiesel === 'number' &&
    body.initialAdvanceDiesel > 0 &&
    normDieselUnit === 'amount'
  ) {
    if (isOwnVehicle) {
      expensesToInsert.push({
        tenant,
        tripId: newSubtrip.tripId,
        subtripId: newSubtrip._id,
        vehicleId,
        amount: body.initialAdvanceDiesel,
        expenseType: 'Diesel',
        expenseCategory: EXPENSE_CATEGORIES.SUBTRIP,
        remarks: 'Initial advance diesel (amount) from UI',
        paidThrough: 'Pump',
        pumpCd: body.pumpCd || null,
      });
    } else {
      advancesToInsert.push({
        tenant,
        subtripId: newSubtrip._id,
        vehicleId,
        amount: body.initialAdvanceDiesel,
        advanceType: 'Diesel',
        remarks: 'Initial advance diesel (amount) from UI',
        paidThrough: 'Pump',
        pumpCd: body.pumpCd || null,
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
};

/**
 * Builds the aggregation pipeline for exporting subtrips to Excel.
 */
export const buildExportSubtripsPipeline = (query) => {
  return [
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
    // Lookup Advances
    {
      $lookup: {
        from: 'transporteradvances',
        localField: 'advances',
        foreignField: '_id',
        as: 'advancesData',
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
        rate: '$freightDetails.rate',
        freightAmount: '$freightDetails.freightAmount',
        commissionRate: '$commissionDetails.commissionRate',
        subtripStatus: 1,
        transporterName: '$transporter.transportName',
        isOwn: '$vehicle.isOwn',
        commissionAmount: '$commissionDetails.commissionAmount',
        // Calculate Total Expenses
        totalExpenses: { $sum: '$expensesData.amount' },
        // Calculate Total Advances
        totalAdvances: { $sum: '$advancesData.amount' },
      },
    },
    {
      $addFields: {
        // Calculate Freight
        calculatedFreight: '$freightAmount',
      },
    },
    {
      $addFields: {
        // Calculate P&L
        profitAndLoss: {
          $cond: {
            if: { $eq: ['$isOwn', false] },
            then: { $ifNull: ['$commissionAmount', 0] },
            else: { $subtract: ['$calculatedFreight', '$totalExpenses'] },
          },
        },
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
};
