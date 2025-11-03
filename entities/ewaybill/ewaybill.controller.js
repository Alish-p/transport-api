import asyncHandler from 'express-async-handler';
import Tenant from '../tenant/tenant.model.js';
import {
  getMastersIndiaEwayBill,
  getMastersIndiaEwayBillsForTransporterByState,
} from './ewaybill.util.js';
import EwayBill from './ewaybill.model.js';
import { STATE_CODE_MAP, STATE_NAME_TO_CODE } from './ewaybill.constants.js';
import Customer from '../customer/customer.model.js';
import Subtrip from '../subtrip/subtrip.model.js';

const getEwayBillByNumber = asyncHandler(async (req, res) => {
  const { number } = req.params; // eway bill number

  const tenant = await Tenant.findById(req.tenant);
  if (!tenant) {
    return res.status(404).json({ message: 'Tenant not found' });
  }

  const integration = tenant?.integrations?.ewayBill;
  if (!integration?.enabled) {
    return res.status(400).json({ message: 'E-Way Bill not integrated' });
  }

  const gstin = tenant?.legalInfo?.gstNumber;
  const payload = await getMastersIndiaEwayBill(gstin, number);

  if (!payload) {
    return res.status(404).json({ message: 'E-Way Bill not found' });
  }

  // Persist successful fetch into flexible EwayBill collection
  const resolvedNumber =
    payload?.EwbNo ||
    payload?.ewbNo ||
    payload?.EWBNo ||
    payload?.ewayBillNo ||
    payload?.eway_bill_number ||
    number;

  try {
    await EwayBill.findOneAndUpdate(
      { tenant: req.tenant, ewayBillNo: String(resolvedNumber) },
      {
        $set: {
          ewayBillNo: String(resolvedNumber),
          gstin,
          source: 'MastersIndia',
          status: 'SUCCESS',
          payload,
          fetchedAt: new Date(),
          tenant: req.tenant,
        },
      },
      { new: true, upsert: true },
    );
  } catch (err) {
    // Do not block response on persistence errors
    console.error('Failed to persist EwayBill', err);
  }

  // Return the provider payload
  res.status(200).json(payload);
});

export { getEwayBillByNumber };

// GET list of eway bills for transporter filtered by state and generated date
const getEwayBillsForTransporterByState = asyncHandler(async (req, res) => {
  const { generated_date, state_code } = req.query;

  if (!generated_date) {
    return res.status(400).json({ message: 'generated_date is required (DD/MM/YYYY)' });
  }

  const tenant = await Tenant.findById(req.tenant);
  if (!tenant) {
    return res.status(404).json({ message: 'Tenant not found' });
  }

  const integration = tenant?.integrations?.ewayBill;
  if (!integration?.enabled) {
    return res.status(400).json({ message: 'E-Way Bill not integrated' });
  }

  const gstin = tenant?.legalInfo?.gstNumber;

  // Resolve state code: prefer query param, else tenant state
  let resolvedStateCode = null;
  if (state_code) {
    // Accept either "29" or 29, ensure zero-padded string
    const sc = String(state_code).padStart(2, '0');
    if (!STATE_CODE_MAP[sc]) {
      return res.status(400).json({ message: `Invalid state_code: ${state_code}` });
    }
    resolvedStateCode = sc;
  } else {
    const stateName = tenant?.legalInfo?.registeredState || tenant?.address?.state;
    const normalized = (stateName || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    const sc = STATE_NAME_TO_CODE[normalized] || null;
    if (!sc) {
      return res.status(400).json({
        message:
          'state_code not provided and could not derive from tenant state. Please supply state_code query param.',
      });
    }
    resolvedStateCode = sc;
  }

  const payload = await getMastersIndiaEwayBillsForTransporterByState(
    gstin,
    generated_date,
    resolvedStateCode,
  );

  // Normalize the provider response to a list we can enrich
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.results?.message)
    ? payload.results.message
    : [];

  // Collect lookups
  const gstins = [...new Set(
    list
      .map((it) => (it?.gstin_of_generator ? String(it.gstin_of_generator) : null))
      .filter(Boolean)
  )];
  const ewbNos = [...new Set(list.map((it) => String(it.eway_bill_number)).filter(Boolean))];

  // Build case-insensitive regex array for GSTIN lookup
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const gstinRegex = gstins.map((g) => new RegExp(`^${escapeRegExp(g)}$`, 'i'));

  // Fetch customers by GSTIN for this tenant
  const customers = await Customer.find(
    { tenant: req.tenant, GSTNo: { $in: gstinRegex } },
    { customerName: 1, GSTNo: 1 },
  ).lean();
  const normalize = (s = '') => s.toString().trim().toUpperCase();
  const customerByGST = new Map(
    customers.map((c) => [normalize(c.GSTNo), { id: String(c._id), name: c.customerName }]),
  );

  // Fetch subtrips by matched eway bill numbers
  const subtrips = await Subtrip.find(
    { tenant: req.tenant, ewayBill: { $in: ewbNos } },
    { subtripNo: 1, driverId: 1, vehicleId: 1, startDate: 1, endDate: 1, subtripStatus: 1, ewayBill: 1 },
  )
    .populate('driverId', 'driverName')
    .populate('vehicleId', 'vehicleNo')
    .lean();

  const subtripByEwb = new Map(
    subtrips.map((st) => [String(st.ewayBill), {
      id: String(st._id),
      subtripNo: st.subtripNo,
      startDate: st.startDate,
      endDate: st.endDate,
      subtripStatus: st.subtripStatus,
      driver: st.driverId ? { id: String(st.driverId._id || st.driverId), name: st.driverId.driverName } : null,
      vehicle: st.vehicleId ? { id: String(st.vehicleId._id || st.vehicleId), vehicleNo: st.vehicleId.vehicleNo } : null,
    }]),
  );

  const enriched = list.map((it) => {
    const genGstin = normalize(it?.gstin_of_generator || '');
    const customer = customerByGST.get(genGstin) || null;
    const ewbKey = String(it.eway_bill_number);
    const st = subtripByEwb.get(ewbKey) || null;
    return {
      ...it,
      customer,
      hasSubtrip: !!st,
      subtrip: st,
    };
  });

  if (Array.isArray(payload)) {
    return res.status(200).json(enriched);
  }

  const response = { ...payload };
  if (response?.results && Array.isArray(response.results.message)) {
    response.results = { ...response.results, message: enriched };
  }
  return res.status(200).json(response);
});

export { getEwayBillsForTransporterByState };
