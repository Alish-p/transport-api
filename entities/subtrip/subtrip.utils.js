import dayjs from 'dayjs';
import { Types } from 'mongoose';
import Vehicle from '../vehicle/vehicle.model.js';
import { SUBTRIP_STATUS } from './subtrip.constants.js';

/**
 * Pure calculator function that calculates the gross freight amount of a subtrip.
 * Does not check database state or prioritize stored values.
 * 
 * @param {Object} params - Input parameters
 * @param {String} params.freightModel - Model used ('per_ton' | 'fixed' | 'per_km' | 'time_based' | 'hybrid')
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
  const model = freightModel || 'per_ton';
  const r = Number(rate) || 0;
  const weight = Number(loadingWeight) || 0;

  if (model === 'per_ton') {
    return r * weight;
  }

  if (model === 'per_km') {
    const start = Number(startKm) || 0;
    const end = Number(endKm) || 0;
    return end > start ? (end - start) * r : 0;
  }

  if (model === 'hybrid') {
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

  if (model === 'time_based') {
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

  if (model === 'fixed') {
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
    query.commissionRate = {};
    if (commissionRateMin !== undefined && commissionRateMin !== '') {
      query.commissionRate.$gte = Number(commissionRateMin);
    }
    if (commissionRateMax !== undefined && commissionRateMax !== '') {
      query.commissionRate.$lte = Number(commissionRateMax);
    }
    if (Object.keys(query.commissionRate).length === 0) {
      delete query.commissionRate;
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

  return { query, hasNoMatchingVehicles };
};

/**
 * Resolves and recalculates freight details and commission details for a subtrip.
 * Consolidates business rules for different freight models (per_ton, hybrid, time_based, etc.).
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

  const model = fdToUse.freightModel || 'per_ton';

  // Recalculate freight amount
  if (model === 'per_ton' || model === 'per_km' || model === 'time_based' || model === 'fixed') {
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
  } else if (model === 'hybrid') {
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
  if (model === 'per_ton') {
    if (cdToUse.commissionRate !== undefined && cdToUse.commissionRate !== null && cdToUse.commissionRate !== '') {
      cdToUse.commissionAmount = Number(cdToUse.commissionRate) * weightToUse;
    }
  }

  return { freightDetails: fdToUse, commissionDetails: cdToUse };
};
