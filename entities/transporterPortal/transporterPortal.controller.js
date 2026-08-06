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

export { getDashboard, getProfile, getVehicles, getVehicleById };
