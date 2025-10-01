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
          // Show own vehicles first, then sort by vehicle number
          .sort({ isOwn: -1, vehicleNo: 1 })
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
    .populate("transporter", "transportName")
    // Own vehicles first, then by vehicle number
    .sort({ isOwn: -1, vehicleNo: 1 });
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



export {
  createVehicle,
  quickCreateVehicle,
  fetchVehicles,
  fetchVehiclesSummary,
  fetchVehicleById,
  updateVehicle,
  deleteVehicle,
};
