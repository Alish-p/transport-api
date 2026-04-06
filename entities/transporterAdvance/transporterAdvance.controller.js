import asyncHandler from 'express-async-handler';
import TransporterAdvance from './transporterAdvance.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Vehicle from '../vehicle/vehicle.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { recordSubtripEvent } from '../../helpers/subtrip-event-helper.js';
import { SUBTRIP_EVENT_TYPES } from '../subtripEvent/subtripEvent.constants.js';

const buildAdvanceBaseQuery = async (req) => {
  const { subtripId, vehicleId, transporterId, startDate, endDate, advanceType, pumpId } = req.query;

  const baseQuery = addTenantToQuery(req);

  if (subtripId) baseQuery.subtripId = subtripId;
  if (vehicleId) baseQuery.vehicleId = vehicleId;
  if (pumpId) baseQuery.pumpCd = pumpId;
  if (advanceType) {
    const typeArray = Array.isArray(advanceType) ? advanceType : [advanceType];
    baseQuery.advanceType = { $in: typeArray };
  }

  if (startDate || endDate) {
    baseQuery.date = {};
    if (startDate) baseQuery.date.$gte = new Date(startDate);
    if (endDate) baseQuery.date.$lte = new Date(endDate);
  }

  if (transporterId) {
    const vehicles = await Vehicle.find(
      addTenantToQuery(req, { transporter: transporterId })
    ).select('_id');

    if (!vehicles.length) {
      return { noResults: true, query: baseQuery };
    }

    baseQuery.vehicleId = { $in: vehicles.map((vehicle) => vehicle._id) };
  }

  return { noResults: false, query: baseQuery };
};

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
  const { status } = req.query;
  const { limit, skip } = req.pagination;

  const { noResults, query: baseQuery } = await buildAdvanceBaseQuery(req);

  if (noResults) {
    return res.status(200).json({
      advances: [],
      totals: {
        totalGiven: 0,
        totalRecovered: 0,
        totalPending: 0,
        countGiven: 0,
        countRecovered: 0,
        countPending: 0,
      },
      total: 0,
      startRange: 0,
      endRange: 0,
    });
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
      .populate({
        path: 'subtripId',
        select: 'subtripNo transporterPaymentReceiptId',
        populate: {
          path: 'transporterPaymentReceiptId',
          select: 'paymentId',
        },
      })
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

const exportTransporterAdvances = asyncHandler(async (req, res) => {
  const { status, columns } = req.query;

  const { noResults, query: baseQuery } = await buildAdvanceBaseQuery(req);

  const COLUMN_MAPPING = {
    subtripId: { header: 'LR No', key: 'subtripNo', width: 20 },
    status: { header: 'Status', key: 'status', width: 15 },
    vehicleNo: { header: 'Vehicle No', key: 'vehicleNo', width: 20 },
    advanceType: { header: 'Advance Type', key: 'advanceType', width: 20 },
    date: { header: 'Date', key: 'date', width: 20 },
    remarks: { header: 'Remarks', key: 'remarks', width: 30 },
    dieselRate: { header: 'Diesel Rate (Rs/Ltr)', key: 'dieselPrice', width: 18 },
    dieselLtr: { header: 'Diesel (Ltr)', key: 'dieselLtr', width: 15 },
    paidThrough: { header: 'Paid Through', key: 'paidThrough', width: 20 },
    pumpCd: { header: 'Pump Name', key: 'pumpName', width: 20 },
    paymentReceiptId: { header: 'Payment Receipt', key: 'paymentId', width: 20 },
    amount: { header: 'Amount', key: 'amount', width: 15 },
  };

  let exportColumns = [];
  if (columns) {
    exportColumns = columns
      .split(',')
      .map((id) => COLUMN_MAPPING[id])
      .filter(Boolean);
  }

  if (exportColumns.length === 0) {
    exportColumns = [
      COLUMN_MAPPING.subtripId,
      COLUMN_MAPPING.status,
      COLUMN_MAPPING.vehicleNo,
      COLUMN_MAPPING.advanceType,
      COLUMN_MAPPING.date,
      COLUMN_MAPPING.amount,
    ];
  }

  const finalQuery = { ...baseQuery };
  if (status && status !== 'all') {
    finalQuery.status = status;
  }

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename=TransporterAdvances.xlsx');

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
  });

  const worksheet = workbook.addWorksheet('Transporter Advances');
  worksheet.columns = exportColumns;

  if (noResults) {
    worksheet.commit();
    await workbook.commit();
    return;
  }

  const pipeline = [
    { $match: finalQuery },
    { $sort: { date: -1 } },
    {
      $lookup: {
        from: 'vehicles',
        localField: 'vehicleId',
        foreignField: '_id',
        as: 'vehicle',
      },
    },
    { $unwind: { path: '$vehicle', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'pumps',
        localField: 'pumpCd',
        foreignField: '_id',
        as: 'pump',
      },
    },
    { $unwind: { path: '$pump', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'subtrips',
        localField: 'subtripId',
        foreignField: '_id',
        as: 'subtrip',
      },
    },
    { $unwind: { path: '$subtrip', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        transporterPaymentReceiptObjectId: {
          $convert: {
            input: '$subtrip.transporterPaymentReceiptId',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    {
      $lookup: {
        from: 'transporterpayments',
        localField: 'transporterPaymentReceiptObjectId',
        foreignField: '_id',
        as: 'paymentReceipt',
      },
    },
    { $unwind: { path: '$paymentReceipt', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        date: 1,
        status: 1,
        advanceType: 1,
        amount: 1,
        dieselLtr: 1,
        dieselPrice: 1,
        paidThrough: 1,
        remarks: 1,
        vehicleNo: '$vehicle.vehicleNo',
        pumpName: '$pump.pumpName',
        subtripNo: '$subtrip.subtripNo',
        paymentId: '$paymentReceipt.paymentId',
      },
    },
  ];

  const cursor = TransporterAdvance.aggregate(pipeline).cursor();

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const row = {};

    exportColumns.forEach((col) => {
      const key = col.key;

      if (key === 'date') {
        row[key] = doc.date ? new Date(doc.date).toISOString().split('T')[0] : '';
      } else if (['amount', 'dieselLtr', 'dieselPrice'].includes(key)) {
        row[key] = typeof doc[key] === 'number' ? Math.round(doc[key] * 100) / 100 : '-';
      } else {
        row[key] = doc[key] || '-';
      }
    });

    worksheet.addRow(row).commit();
  }

  worksheet.commit();
  await workbook.commit();
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

export {
  createTransporterAdvance,
  fetchPaginatedAdvances,
  exportTransporterAdvances,
  deleteTransporterAdvance,
};
