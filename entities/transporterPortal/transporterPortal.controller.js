import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';

import VehicleModel from '../vehicle/vehicle.model.js';
import SubtripModel from '../subtrip/subtrip.model.js';
import TransporterModel from '../transporter/transporter.model.js';
import TransporterPaymentModel from '../transporterPayment/transporterPayment.model.js';
import TransporterAdvanceModel from '../transporterAdvance/transporterAdvance.model.js';


// ----------------------------------------------------------------------
// Dashboard Analytics
// ----------------------------------------------------------------------

/**
 * GET /api/transporter-portal/dashboard
 * Returns aggregated metrics for the authenticated transporter.
 */
const getDashboard = asyncHandler(async (req, res) => {
  const transporterId = req.transporter._id;
  const tenant = req.tenant;

  // Get all vehicles for this transporter
  const vehicleIds = await VehicleModel.find(
    { transporter: transporterId, tenant, isActive: true },
    { _id: 1 },
  ).lean();

  const vehicleObjectIds = vehicleIds.map((v) => v._id);

  // Run all aggregations in parallel
  const [
    totalVehicles,
    activeTrips,
    completedTrips,
    earningsResult,
    pendingResult,
    advancesResult,
    monthlyEarnings,
  ] = await Promise.all([
    // 1. Total active vehicles
    vehicleIds.length,

    // 2. Active trips (in-progress subtrips)
    SubtripModel.countDocuments({
      vehicleId: { $in: vehicleObjectIds },
      tenant,
      subtripStatus: { $in: ['In Transit', 'Loaded'] },
    }),

    // 3. Completed trips (all-time)
    SubtripModel.countDocuments({
      vehicleId: { $in: vehicleObjectIds },
      tenant,
      subtripStatus: 'Received',
    }),

    // 4. Total earnings (paid payments)
    TransporterPaymentModel.aggregate([
      {
        $match: {
          transporterId: new mongoose.Types.ObjectId(transporterId),
          tenant: new mongoose.Types.ObjectId(tenant),
          status: 'Paid',
        },
      },
      { $group: { _id: null, total: { $sum: '$summary.netIncome' } } },
    ]),

    // 5. Pending payments (generated/unpaid)
    TransporterPaymentModel.aggregate([
      {
        $match: {
          transporterId: new mongoose.Types.ObjectId(transporterId),
          tenant: new mongoose.Types.ObjectId(tenant),
          status: 'Generated',
        },
      },
      { $group: { _id: null, total: { $sum: '$summary.netIncome' } } },
    ]),

    // 6. Total advances received
    TransporterAdvanceModel.aggregate([
      {
        $match: {
          subtripId: { $in: await SubtripModel.find(
            { vehicleId: { $in: vehicleObjectIds }, tenant },
            { _id: 1 },
          ).lean().then((subs) => subs.map((s) => s._id)) },
          tenant: new mongoose.Types.ObjectId(tenant),
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),

    // 7. Monthly earnings (last 6 months)
    TransporterPaymentModel.aggregate([
      {
        $match: {
          transporterId: new mongoose.Types.ObjectId(transporterId),
          tenant: new mongoose.Types.ObjectId(tenant),
          status: 'Paid',
          paidDate: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$paidDate' },
            month: { $month: '$paidDate' },
          },
          total: { $sum: '$summary.netIncome' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  return res.status(200).json({
    totalVehicles,
    activeTrips,
    completedTrips,
    totalEarnings: earningsResult[0]?.total || 0,
    pendingPayments: pendingResult[0]?.total || 0,
    totalAdvances: advancesResult[0]?.total || 0,
    monthlyEarnings: monthlyEarnings.map((m) => ({
      year: m._id.year,
      month: m._id.month,
      total: m.total,
    })),
  });
});

// ----------------------------------------------------------------------
// Profile
// ----------------------------------------------------------------------

/**
 * GET /api/transporter-portal/profile
 * Returns the authenticated transporter's profile with tenant info.
 */
const getProfile = asyncHandler(async (req, res) => {
  const transporter = await TransporterModel.findById(req.transporter._id)
    .populate('tenant', 'name slug logoUrl contactDetails');

  if (!transporter) {
    return res.status(404).json({ message: 'Transporter not found.' });
  }

  return res.status(200).json({ transporter });
});

// ----------------------------------------------------------------------
// Vehicles
// ----------------------------------------------------------------------

/**
 * GET /api/transporter-portal/vehicles
 * Returns all vehicles belonging to the authenticated transporter.
 */
const getVehicles = asyncHandler(async (req, res) => {
  const vehicles = await VehicleModel.find({
    transporter: req.transporter._id,
    tenant: req.tenant,
  }).sort({ isActive: -1, vehicleNo: 1 }).lean();

  return res.status(200).json({ vehicles });
});

/**
 * GET /api/transporter-portal/vehicles/:id
 * Returns a single vehicle, verified to belong to the authenticated transporter.
 */
const getVehicleById = asyncHandler(async (req, res) => {
  const vehicle = await VehicleModel.findOne({
    _id: req.params.id,
    transporter: req.transporter._id,
    tenant: req.tenant,
  }).lean();

  if (!vehicle) {
    return res.status(404).json({ message: 'Vehicle not found.' });
  }

  return res.status(200).json({ vehicle });
});

// ----------------------------------------------------------------------
// Subtrips / Jobs
// ----------------------------------------------------------------------

/**
 * Helper to sanitize and compute post-commission freight amount and rate for fleet owners.
 * Transporters should ONLY see post-commission freight values.
 */
function formatSubtripForTransporter(subtrip) {
  if (!subtrip) return subtrip;

  const grossFreightAmount = subtrip.freightDetails?.freightAmount || 0;
  const commissionAmount = subtrip.commissionDetails?.commissionAmount || 0;
  const commissionRate = subtrip.commissionDetails?.commissionRate || 0;
  const grossRate = subtrip.freightDetails?.rate || 0;

  const netFreightAmount = Math.max(0, grossFreightAmount - commissionAmount);

  let netRate = 0;
  if (subtrip.freightDetails?.freightModel === 'fixed') {
    netRate = netFreightAmount;
  } else {
    netRate = Math.max(0, grossRate - commissionRate);
  }

  const formattedSubtrip = {
    ...subtrip,
    freightDetails: subtrip.freightDetails
      ? {
          ...subtrip.freightDetails,
          rate: netRate,
          freightAmount: netFreightAmount,
        }
      : undefined,
  };

  delete formattedSubtrip.commissionDetails;
  return formattedSubtrip;
}

/**
 * GET /api/transporter-portal/subtrips
 * Returns subtrips for vehicles belonging to the authenticated transporter.
 */
const getSubtrips = asyncHandler(async (req, res) => {
  const transporterId = req.transporter._id;
  const tenant = req.tenant;
  const { status, search } = req.query;

  // Get all vehicle IDs belonging to this transporter
  const vehicles = await VehicleModel.find(
    { transporter: transporterId, tenant },
    { _id: 1 }
  ).lean();

  const vehicleIds = vehicles.map((v) => v._id);

  if (vehicleIds.length === 0) {
    return res.status(200).json({
      subtrips: [],
      total: 0,
      completedCount: 0,
      pendingCount: 0,
    });
  }

  const baseQuery = {
    vehicleId: { $in: vehicleIds },
    tenant,
  };

  const COMPLETED_STATUSES = ['Received', 'received', 'Billed', 'billed'];

  const [total, completedCount, pendingCount] = await Promise.all([
    SubtripModel.countDocuments(baseQuery),
    SubtripModel.countDocuments({
      ...baseQuery,
      subtripStatus: { $in: COMPLETED_STATUSES },
    }),
    SubtripModel.countDocuments({
      ...baseQuery,
      subtripStatus: { $nin: COMPLETED_STATUSES },
    }),
  ]);

  const query = { ...baseQuery };

  if (status === 'completed') {
    query.subtripStatus = { $in: COMPLETED_STATUSES };
  } else if (status === 'pending') {
    query.subtripStatus = { $nin: COMPLETED_STATUSES };
  }

  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    query.$or = [
      { subtripNo: searchRegex },
      { invoiceNo: searchRegex },
      { loadingPoint: searchRegex },
      { unloadingPoint: searchRegex },
      { consignee: searchRegex },
      { materialType: searchRegex },
    ];
  }

  const rawSubtrips = await SubtripModel.find(query)
    .populate('vehicleId', 'vehicleNo vehicleType loadingCapacity vehicleCompany modelType')
    .populate('driverId', 'name mobile')
    .sort({ startDate: -1, createdAt: -1 })
    .lean();

  const subtrips = rawSubtrips.map(formatSubtripForTransporter);

  return res.status(200).json({
    subtrips,
    total,
    completedCount,
    pendingCount,
  });
});

/**
 * GET /api/transporter-portal/subtrips/:id
 * Returns single subtrip detail verified for the authenticated transporter.
 */
const getSubtripById = asyncHandler(async (req, res) => {
  const transporterId = req.transporter._id;
  const tenant = req.tenant;

  const vehicles = await VehicleModel.find(
    { transporter: transporterId, tenant },
    { _id: 1 }
  ).lean();

  const vehicleIds = vehicles.map((v) => v._id);

  const rawSubtrip = await SubtripModel.findOne({
    _id: req.params.id,
    vehicleId: { $in: vehicleIds },
    tenant,
  })
    .populate('vehicleId', 'vehicleNo vehicleType loadingCapacity vehicleCompany modelType')
    .populate('driverId', 'name mobile licenseNumber')
    .populate('advances')
    .lean();

  if (!rawSubtrip) {
    return res.status(404).json({ message: 'Subtrip job not found.' });
  }

  const subtrip = formatSubtripForTransporter(rawSubtrip);

  return res.status(200).json({ subtrip });
});

// ----------------------------------------------------------------------
// Transporter Payments
// ----------------------------------------------------------------------

/**
 * GET /api/transporter-portal/payments
 * Returns payments/vouchers for the authenticated transporter.
 */
const getPayments = asyncHandler(async (req, res) => {
  const transporterId = req.transporter._id;
  const tenant = req.tenant;
  const { status, search } = req.query;

  const baseQuery = {
    transporterId,
    tenant,
  };

  const query = { ...baseQuery };

  if (status && status !== 'all') {
    query.status = status;
  }

  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    query.$or = [
      { paymentId: searchRegex },
      { 'subtripSnapshot.subtripNo': searchRegex },
      { 'subtripSnapshot.vehicleNo': searchRegex },
      { 'subtripSnapshot.invoiceNo': searchRegex },
    ];
  }

  const [allPayments, filteredPayments] = await Promise.all([
    TransporterPaymentModel.find(baseQuery).lean(),
    TransporterPaymentModel.find(query)
      .populate('transporterId', 'transportName cellNo bankDetails panNo gstNo')
      .populate('tenant', 'name logoUrl contactDetails address config')

      .sort({ issueDate: -1, createdAt: -1 })
      .lean(),
  ]);

  let totalNetIncome = 0;
  let totalPaidAmount = 0;
  let totalPendingAmount = 0;

  allPayments.forEach((p) => {
    const net = p.summary?.netIncome || 0;
    totalNetIncome += net;
    if (p.status === 'paid') {
      totalPaidAmount += net;
    } else if (p.status === 'generated') {
      totalPendingAmount += net;
    }
  });

  return res.status(200).json({
    payments: filteredPayments,
    total: allPayments.length,
    filteredTotal: filteredPayments.length,
    totalNetIncome,
    totalPaidAmount,
    totalPendingAmount,
  });
});

/**
 * GET /api/transporter-portal/payments/:id
 * Returns single transporter payment details for the authenticated transporter.
 */
const getPaymentById = asyncHandler(async (req, res) => {
  const transporterId = req.transporter._id;
  const tenant = req.tenant;
  const { id } = req.params;

  const query = {
    transporterId,
    tenant,
    ...(mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { paymentId: id }),
  };

  const payment = await TransporterPaymentModel.findOne(query)
    .populate('transporterId', 'transportName cellNo emailId address state pinNo bankDetails panNo gstNo')
    .populate('tenant', 'name logoUrl contactDetails address config')

    .lean();

  if (!payment) {
    return res.status(404).json({ message: 'Transporter payment record not found.' });
  }

  return res.status(200).json({ payment });
});

export {
  getDashboard,
  getProfile,
  getVehicles,
  getVehicleById,
  getSubtrips,
  getSubtripById,
  getPayments,
  getPaymentById,
};


