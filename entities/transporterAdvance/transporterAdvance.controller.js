import asyncHandler from 'express-async-handler';
import TransporterAdvance from './transporterAdvance.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { recordSubtripEvent } from '../../helpers/subtrip-event-helper.js';
import { SUBTRIP_EVENT_TYPES } from '../subtripEvent/subtripEvent.constants.js';

// Create a TransporterAdvance
const createTransporterAdvance = asyncHandler(async (req, res) => {
  const { subtripId } = req.body;

  const subtrip = await Subtrip.findOne({
    _id: subtripId,
    tenant: req.tenant,
  }).populate({ path: 'vehicleId', select: 'isOwn' });

  if (!subtrip) {
    return res.status(404).json({ message: 'Subtrip not found' });
  }

  // Only market-vehicle subtrips should use advances
  if (subtrip.vehicleId?.isOwn) {
    return res.status(400).json({
      message: 'Advances are only for market vehicle subtrips. Use expenses for own vehicles.',
    });
  }

  const advance = new TransporterAdvance({
    ...req.body,
    vehicleId: subtrip.vehicleId?._id || subtrip.vehicleId,
    tenant: req.tenant,
  });

  const savedAdvance = await advance.save();

  // Push to subtrip.advances
  subtrip.advances.push(savedAdvance._id);
  await subtrip.save();

  // Record event
  await recordSubtripEvent(
    subtrip._id,
    SUBTRIP_EVENT_TYPES.ADVANCE_ADDED,
    { advanceType: savedAdvance.advanceType, amount: savedAdvance.amount },
    req.user,
    req.tenant
  );

  res.status(201).json(savedAdvance);
});

// Fetch paginated TransporterAdvances
const fetchPaginatedAdvances = asyncHandler(async (req, res) => {
  const { subtripId, vehicleId, startDate, endDate, advanceType, status } = req.query;
  const { limit, skip } = req.pagination;

  const baseQuery = addTenantToQuery(req);

  if (subtripId) baseQuery.subtripId = subtripId;
  if (vehicleId) baseQuery.vehicleId = vehicleId;
  if (advanceType) {
    const typeArray = Array.isArray(advanceType) ? advanceType : [advanceType];
    baseQuery.advanceType = { $in: typeArray };
  }

  if (startDate || endDate) {
    baseQuery.date = {};
    if (startDate) baseQuery.date.$gte = new Date(startDate);
    if (endDate) baseQuery.date.$lte = new Date(endDate);
  }

  // Calculate totals via aggregation over baseQuery (ignores status filter to get header sums)
  const aggregationResult = await TransporterAdvance.aggregate([
    { $match: baseQuery },
    {
      $group: {
        _id: '$status', // 'Pending' or 'Recovered'
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const totals = {
    totalGiven: 0,
    totalRecovered: 0,
    totalPending: 0,
    countGiven: 0,
    countRecovered: 0,
    countPending: 0,
  };

  aggregationResult.forEach((res) => {
    totals.totalGiven += res.totalAmount;
    totals.countGiven += res.count;
    if (res._id === 'Recovered') {
      totals.totalRecovered = res.totalAmount;
      totals.countRecovered = res.count;
    }
    if (res._id === 'Pending') {
      totals.totalPending = res.totalAmount;
      totals.countPending = res.count;
    }
  });

  // Now apply specific status filter if passed for the table view
  const finalQuery = { ...baseQuery };
  if (status && status !== 'all') {
    finalQuery.status = status;
  }

  const [advances, total] = await Promise.all([
    TransporterAdvance.find(finalQuery)
      .populate({ path: 'vehicleId', select: 'vehicleNo' })
      .populate({ path: 'pumpCd', select: 'pumpName' })
      .populate({ path: 'subtripId', select: 'subtripNo transporterPaymentReceiptId' })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TransporterAdvance.countDocuments(finalQuery),
  ]);

  res.status(200).json({
    advances,
    totals,
    total,
    startRange: skip + 1,
    endRange: skip + advances.length,
  });
});

// Delete a TransporterAdvance
const deleteTransporterAdvance = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const advance = await TransporterAdvance.findOne({ _id: id, tenant: req.tenant });
  if (!advance) {
    return res.status(404).json({ message: 'Advance not found' });
  }

  if (advance.status === 'Recovered') {
    return res.status(400).json({ message: 'Cannot delete a recovered advance' });
  }

  // Remove reference from subtrip
  if (advance.subtripId) {
    await Subtrip.findOneAndUpdate(
      { _id: advance.subtripId, tenant: req.tenant },
      { $pull: { advances: advance._id } }
    );

    // Record event
    await recordSubtripEvent(
      advance.subtripId,
      SUBTRIP_EVENT_TYPES.ADVANCE_DELETED,
      { advanceType: advance.advanceType, amount: advance.amount },
      req.user,
      req.tenant
    );
  }

  await TransporterAdvance.findOneAndDelete({ _id: id, tenant: req.tenant });

  res.status(200).json({ message: 'Advance deleted successfully' });
});

export { createTransporterAdvance, fetchPaginatedAdvances, deleteTransporterAdvance };
