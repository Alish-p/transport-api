import asyncHandler from 'express-async-handler';
import Tenant from '../tenant/tenant.model.js';
import Vehicle from '../vehicle/vehicle.model.js';
import Challan from './challan.model.js';
import ChallanLookup from './challanLookup.model.js';
import { fetchChallansForVehicle, normalizeProviderResponse } from '../../helpers/echallan.js';

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /challans?vehicleNo=XX — DB only
export const getChallansFromDB = asyncHandler(async (req, res) => {
  const vno = req.query?.vehicleNo || req.query?.vehiclenumber;
  if (!vno) {
    return res.status(400).json({ message: 'vehicleNo is required' });
  }

  const vehicle = await Vehicle.findOne({ tenant: req.tenant, vehicleNo: String(vno).trim() });
  if (!vehicle) {
    return res.status(404).json({ message: 'Vehicle not found for this tenant' });
  }
  if (!vehicle.isOwn) {
    return res.status(403).json({ message: 'Challan lookup allowed only for own vehicles' });
  }

  const lastLookup = await ChallanLookup.findOne({ tenant: req.tenant, vehicle: vehicle._id })
    .sort({ createdAt: -1 })
    .lean();
  const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
  const lastFetchedAt = lastLookup?.createdAt || null;
  const nextAllowedAt = lastFetchedAt ? new Date(new Date(lastFetchedAt).getTime() + tenDaysMs) : null;

  const docs = await Challan.find({ tenant: req.tenant, vehicle: vehicle._id })
    .sort({ challanDateTime: -1 })
    .lean();
  const pending = docs.filter((d) => d.status === 'Pending');
  const disposed = docs.filter((d) => d.status === 'Disposed');

  return res.status(200).json({
    vehicleNo: vehicle.vehicleNo,
    lastFetchedAt,
    nextAllowedAt,
    pendingCount: pending.length,
    disposedCount: disposed.length,
    results: { pending, disposed },
  });
});

// POST /challans/sync — Provider fetch with cooldown
export const syncChallansFromProvider = asyncHandler(async (req, res) => {
  const vno = req.body?.vehicleNo || req.body?.vehiclenumber;
  if (!vno) {
    return res.status(400).json({ message: 'vehicleNo is required' });
  }

  // Gate by tenant integration flag
  const tenant = await Tenant.findById(req.tenant).select('integrations');
  const enabled = tenant?.integrations?.challanApi?.enabled;
  if (!enabled) {
    return res.status(400).json({ message: 'Challan API is not enabled for this tenant' });
  }

  const vehicle = await Vehicle.findOne({ tenant: req.tenant, vehicleNo: String(vno).trim() });
  if (!vehicle) {
    return res.status(404).json({ message: 'Vehicle not found for this tenant' });
  }
  if (!vehicle.isOwn) {
    return res.status(403).json({ message: 'Challan lookup allowed only for own vehicles' });
  }

  // Enforce 10-day cooldown per vehicle
  const lastLookup = await ChallanLookup.findOne({ tenant: req.tenant, vehicle: vehicle._id })
    .sort({ createdAt: -1 })
    .lean();
  const now = new Date();
  const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
  if (lastLookup) {
    const diffMs = now.getTime() - new Date(lastLookup.createdAt).getTime();
    if (diffMs < tenDaysMs) {
      const nextAllowedAt = new Date(new Date(lastLookup.createdAt).getTime() + tenDaysMs);
      const existing = await Challan.find({ tenant: req.tenant, vehicle: vehicle._id })
        .sort({ challanDateTime: -1 })
        .lean();
      return res.status(429).json({
        message: 'Challan fetch is limited to once every 10 days for a vehicle',
        lastFetchedAt: lastLookup.createdAt,
        nextAllowedAt,
        cached: true,
        results: existing,
      });
    }
  }

  // Call provider
  let raw;
  try {
    raw = await fetchChallansForVehicle(vehicle.vehicleNo);
  } catch (err) {
    return res.status(502).json({ message: 'Failed to fetch challans from provider', error: err.message });
  }

  const { pending, disposed } = normalizeProviderResponse(raw);
  const all = [...pending, ...disposed];

  // Upsert challans
  if (all.length) {
    const ops = all
      .filter((c) => c?.challanNo)
      .map((c) => ({
        updateOne: {
          filter: { tenant: req.tenant, challanNo: c.challanNo },
          update: {
            $set: {
              tenant: req.tenant,
              vehicle: vehicle._id,
              vehicleNo: vehicle.vehicleNo,
              provider: 'webcorevision',
              status: c.status,
              challanDateTime: c.challanDateTime,
              place: c.place,
              sentToRegCourt: c.sentToRegCourt,
              remark: c.remark,
              fineImposed: c.fineImposed,
              dlNo: c.dlNo,
              driverName: c.driverName,
              ownerName: c.ownerName,
              violatorName: c.violatorName,
              receiptNo: c.receiptNo,
              receivedAmount: c.receivedAmount,
              department: c.department,
              stateCode: c.stateCode,
              documentImpounded: c.documentImpounded,
              offenceDetails: c.offenceDetails || [],
              amountOfFineImposed: c.amountOfFineImposed,
              courtAddress: c.courtAddress,
              courtName: c.courtName,
              dateOfProceeding: c.dateOfProceeding,
              sentToCourtOn: c.sentToCourtOn,
              sentToVirtualCourt: c.sentToVirtualCourt,
              rtoDistrictName: c.rtoDistrictName,
            },
          },
          upsert: true,
        },
      }));
    if (ops.length) {
      await Challan.bulkWrite(ops, { ordered: false });
    }
  }

  // Save lookup snapshot for cooldown tracking
  await ChallanLookup.create({
    tenant: req.tenant,
    vehicle: vehicle._id,
    vehicleNo: vehicle.vehicleNo,
    provider: 'webcorevision',
    providerResponse: raw,
    summary: { pendingCount: pending.length, disposedCount: disposed.length },
  });

  // Return normalized data
  return res.status(200).json({
    vehicleNo: vehicle.vehicleNo,
    lastFetchedAt: new Date(),
    nextAllowedAt: new Date(Date.now() + tenDaysMs),
    pendingCount: pending.length,
    disposedCount: disposed.length,
    results: { pending, disposed },
  });
});

