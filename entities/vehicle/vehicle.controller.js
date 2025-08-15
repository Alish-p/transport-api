import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Vehicle from './vehicle.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Expense from '../expense/expense.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { SUBTRIP_STATUS } from '../subtrip/subtrip.constants.js';
import { EXPENSE_CATEGORIES } from '../expense/expense.constants.js';

// Create Vehicle
const createVehicle = asyncHandler(async (req, res) => {
  // Ensure transporter is null if the vehicle is owned
  if (req.body.isOwn) {
    req.body.transporter = null;
  }

  const vehicle = new Vehicle({ ...req.body, tenant: req.tenant });
  const newVehicle = await vehicle.save();

  res.status(201).json(newVehicle);
});

// Quick Create Vehicle (only basic details)
const quickCreateVehicle = asyncHandler(async (req, res) => {
  const { vehicleNo, transporterId, noOfTyres, vehicleType } = req.body;

  if (!vehicleNo || !transporterId || !noOfTyres || !vehicleType) {
    return res.status(400).json({
      message:
        "vehicleNo, transporterId, noOfTyres and vehicleType are required",
    });
  }

  const now = new Date();

  const vehicle = new Vehicle({
    vehicleNo,
    transporter: transporterId,
    noOfTyres,
    vehicleType,
    modelType: "N/A",
    vehicleCompany: "N/A",
    manufacturingYear: now.getFullYear(),
    loadingCapacity: 0,
    engineType: "N/A",
    fuelTankCapacity: 0,
    isOwn: false,
    tenant: req.tenant,
  });

  const newVehicle = await vehicle.save();

  res.status(201).json(newVehicle);
});

// Fetch Vehicles with pagination and search
const fetchVehicles = asyncHandler(async (req, res) => {
  try {
    const { vehicleNo, vehicleType, isOwn, transporter, noOfTyres } = req.query;
    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (vehicleNo) {
      query.vehicleNo = { $regex: vehicleNo, $options: "i" };
    }

    if (vehicleType) {
      const types = Array.isArray(vehicleType) ? vehicleType : [vehicleType];
      query.vehicleType = { $in: types };
    }

    if (typeof isOwn !== "undefined") {
      query.isOwn = isOwn === "true" || isOwn === true || isOwn === "1";
    }

    if (transporter) {
      const ids = Array.isArray(transporter) ? transporter : [transporter];
      query.transporter = { $in: ids };
    }

    if (noOfTyres) {
      const tyres = Array.isArray(noOfTyres) ? noOfTyres : [noOfTyres];
      query.noOfTyres = { $in: tyres.map((t) => Number(t)) };
    }

    const [vehicles, total, totalOwnVehicle, totalMarketVehicle] =
      await Promise.all([
        Vehicle.find(query)
          .populate("transporter", "transportName")
          .sort({ vehicleNo: 1 })
          .skip(skip)
          .limit(limit),
        Vehicle.countDocuments(query),
        Vehicle.countDocuments({ ...query, isOwn: true }),
        Vehicle.countDocuments({ ...query, isOwn: false }),
      ]);

    res.status(200).json({
      results: vehicles,
      total,
      totalOwnVehicle,
      totalMarketVehicle,
      startRange: skip + 1,
      endRange: skip + vehicles.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching paginated vehicles",
      error: error.message,
    });
  }
});

// fetch vehicles
const fetchVehiclesSummary = asyncHandler(async (req, res) => {
  const Vehicles = await Vehicle.find({ tenant: req.tenant })
    .select("vehicleNo vehicleType modelType vehicleCompany noOfTyres isOwn")
    .populate("transporter", "transportName");
  res.status(200).json(Vehicles);
});

// fetch single vehicle by id
const fetchVehicleById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const vehicle = await Vehicle.findOne({
    _id: id,
    tenant: req.tenant,
  }).populate("transporter", "transportName");
  if (!vehicle) {
    res.status(404).json({ message: "Vehicle not found" });
    return;
  }

  res.status(200).json(vehicle);
});

// Update Vehicle
const updateVehicle = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Ensure transporter is null if the vehicle is owned
  if (req.body.isOwn) {
    req.body.transporter = null;
  }
  const vehicle = await Vehicle.findOneAndUpdate(
    { _id: id, tenant: req.tenant },
    req.body,
    { new: true }
  );

  res.status(200).json(vehicle);
});

// Delete Vehicle
const deleteVehicle = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const vehicle = await Vehicle.findOneAndDelete({
    _id: id,
    tenant: req.tenant,
  });

  res.status(200).json(vehicle);
});

// Get billing summary for a vehicle within a date range
const getVehicleBillingSummary = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  const start = startDate ? new Date(startDate) : new Date(0);
  const end = endDate ? new Date(endDate) : new Date();

  const matchStage = {
    subtripStatus: {
      $in: [SUBTRIP_STATUS.BILLED],
    },
    startDate: { $gte: start, $lte: end },
  };

  const vehicleObjectId = new mongoose.Types.ObjectId(id);

  const subtrips = await Subtrip.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: "trips",
        localField: "tripId",
        foreignField: "_id",
        as: "trip",
      },
    },
    { $unwind: "$trip" },
    { $match: { "trip.vehicleId": vehicleObjectId } },
    {
      $lookup: {
        from: "expenses",
        localField: "expenses",
        foreignField: "_id",
        as: "expenseDocs",
      },
    },
    {
      $lookup: {
        from: "routes",
        localField: "routeCd",
        foreignField: "_id",
        as: "route",
      },
    },
    { $unwind: { path: "$route", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customer",
      },
    },
    { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "invoices",
        localField: "invoiceId",
        foreignField: "_id",
        as: "invoice",
      },
    },
    { $unwind: { path: "$invoice", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        amt: {
          $multiply: [
            { $ifNull: ["$rate", 0] },
            { $ifNull: ["$loadingWeight", 0] },
          ],
        },
        totalExpense: { $sum: "$expenseDocs.amount" },
      },
    },
    {
      $project: {
        _id: 1,
        rate: 1,
        loadingWeight: 1,
        startDate: 1,
        endDate: 1,
        invoiceId: "$invoice._id",
        invoiceNo: "$invoice.invoiceNo",
        customerName: "$customer.customerName",
        routeName: "$route.routeName",
        amt: 1,
        totalExpense: 1,
      },
    },
    { $sort: { startDate: 1 } },
  ]);

  const [subtripAgg, vehicleAgg] = await Promise.all([
    Expense.aggregate([
      {
        $match: {
          vehicleId: vehicleObjectId,
          expenseCategory: EXPENSE_CATEGORIES.SUBTRIP,
          date: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
    Expense.aggregate([
      {
        $match: {
          vehicleId: vehicleObjectId,
          expenseCategory: EXPENSE_CATEGORIES.VEHICLE,
          date: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
  ]);

  const totalSubtripExpense = subtripAgg[0]?.amount || 0;
  const totalVehicleExpense = vehicleAgg[0]?.amount || 0;
  const totalFreightAmount = subtrips.reduce(
    (sum, st) => sum + (st.amt || 0),
    0
  );

  res.status(200).json({
    subtrips,
    totals: {
      subtripExpense: totalSubtripExpense,
      vehicleExpense: totalVehicleExpense,
      totalProfit: totalFreightAmount,
    },
  });
});

export { createVehicle,
  quickCreateVehicle,
  fetchVehicles,
  fetchVehiclesSummary,
  fetchVehicleById,
  updateVehicle,
  deleteVehicle,
  getVehicleBillingSummary, };
