import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Vehicle from './vehicle.model.js';
import VehicleDocument from '../vehicleDocument/vehicleDocument.model.js';
import VehicleLookup from '../vehicleLookup/vehicleLookup.model.js';
import Tenant from '../tenant/tenant.model.js';
import { normalizeVehicleDetails, extractDocuments, fetchVehicleByNumber } from '../../helpers/webcorevision.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Trip from '../trip/trip.model.js';
import Expense from '../expense/expense.model.js';
import Tyre from '../tyre/tyre.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { SUBTRIP_STATUS } from '../subtrip/subtrip.constants.js';
import { EXPENSE_CATEGORIES } from '../expense/expense.constants.js';
import { TYRE_LAYOUTS } from '../../constants/tyreLayouts.js';

// Get Tyre Layouts
const getTyreLayouts = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: TYRE_LAYOUTS });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Create Vehicle
const createVehicle = asyncHandler(async (req, res) => {
  // Ensure transporter is null if the vehicle is owned
  if (req.body.isOwn) {
    req.body.transporter = null;
  }

  const vehicle = new Vehicle({ ...req.body, tenant: req.tenant });
  const newVehicle = await vehicle.save();

  // Best-effort: auto-create documents from latest lookup for this vehicle
  try {
    const tenant = await Tenant.findById(req.tenant).select('integrations');
    const enabled = tenant?.integrations?.vehicleApi?.enabled;
    if (enabled && newVehicle?.isOwn) {
      const latestLookup = await VehicleLookup.findOne({ tenant: req.tenant, vehicleNo: newVehicle.vehicleNo })
        .sort({ createdAt: -1 })
        .lean();
      const docs = latestLookup?.normalized?.docs || [];
      if (Array.isArray(docs) && docs.length) {
        const toCreate = docs.map((d) => ({
          tenant: req.tenant,
          vehicle: newVehicle._id,
          docType: d.docType,
          // docNumber optional
          ...(d.docNumber ? { docNumber: d.docNumber } : {}),
          issuer: d.issuer || undefined,
          issueDate: d.issueDate ? new Date(d.issueDate) : undefined,
          expiryDate: d.expiryDate ? new Date(d.expiryDate) : undefined,
          createdBy: req.user?._id,
          isActive: true,
        }));
        if (toCreate.length) {
          await VehicleDocument.insertMany(toCreate, { ordered: false });
        }
      }
    }
  } catch (e) {
    // non-blocking; log if needed
  }

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
  getTyreLayouts,
  fetchOrphanVehicles,
  cleanupVehicles,
};

/**
 * Fetch all orphan vehicles - vehicles not referenced in any subtrip, trip, expense, tyre, or document
 */
const fetchOrphanVehicles = asyncHandler(async (req, res) => {
  const tenant = req.tenant;

  // Get all vehicle IDs that ARE referenced in related collections
  const [subtripVehicleIds, tripVehicleIds, expenseVehicleIds, tyreVehicleIds, documentVehicleIds] = await Promise.all([
    Subtrip.distinct('vehicleId', { tenant }),
    Trip.distinct('vehicleId', { tenant }),
    Expense.distinct('vehicleId', { tenant }),
    Tyre.distinct('currentVehicleId', { tenant }),
    VehicleDocument.distinct('vehicle', { tenant }),
  ]);

  // Combine all referenced vehicle IDs
  const referencedVehicleIds = [
    ...subtripVehicleIds,
    ...tripVehicleIds,
    ...expenseVehicleIds,
    ...tyreVehicleIds,
    ...documentVehicleIds,
  ];

  // Find active vehicles NOT in the referenced list
  const orphanVehicles = await Vehicle.find({
    tenant,
    isActive: true,
    _id: { $nin: referencedVehicleIds },
  })
    .select('vehicleNo vehicleType createdAt')
    .sort({ vehicleNo: 1 });

  res.status(200).json({
    orphanVehicles,
    count: orphanVehicles.length,
  });
});

/**
 * Soft delete (cleanup) selected vehicles by setting isActive to false
 */
const cleanupVehicles = asyncHandler(async (req, res) => {
  const { vehicleIds } = req.body;
  const tenant = req.tenant;

  if (!vehicleIds || !Array.isArray(vehicleIds) || vehicleIds.length === 0) {
    res.status(400).json({ message: 'vehicleIds array is required' });
    return;
  }

  // Update all selected vehicles to inactive
  const result = await Vehicle.updateMany(
    { _id: { $in: vehicleIds }, tenant },
    { $set: { isActive: false } }
  );

  res.status(200).json({
    message: `${result.modifiedCount} vehicle(s) cleaned up successfully`,
    modifiedCount: result.modifiedCount,
  });
});

// Lookup vehicle details via external provider and persist normalized snapshot
export const lookupVehicleDetails = asyncHandler(async (req, res) => {
  const { vehicleNo } = req.body || {};
  if (!vehicleNo) {
    return res.status(400).json({ message: 'vehicleNo is required' });
  }

  // Check tenant integration flag
  const tenant = await Tenant.findById(req.tenant).select('integrations');
  const enabled = tenant?.integrations?.vehicleApi?.enabled;
  if (!enabled) {
    return res.status(400).json({ message: 'Vehicle API integration is not enabled for this tenant' });
  }

  // Fetch from provider
  let raw;
  try {
    raw = await fetchVehicleByNumber(vehicleNo);
  } catch (err) {
    return res.status(502).json({ message: 'Failed to fetch from provider', error: err.message });
  }

  const normalized = normalizeVehicleDetails(raw);
  const docs = extractDocuments(raw);
  const snapshot = { ...normalized, docs };

  // Persist lookup snapshot
  await VehicleLookup.create({
    tenant: req.tenant,
    vehicleNo: normalized.vehicleNo || vehicleNo,
    provider: 'webcorevision',
    providerResponse: raw,
    normalized: snapshot,
  });

  // Return normalized data aligned with Vehicle model fields, plus doc suggestions
  return res.status(200).json({
    vehicle: normalized,
    documentsSuggested: docs,
  });
});
