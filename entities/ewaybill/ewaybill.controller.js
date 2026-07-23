/* eslint-disable perfectionist/sort-imports */
import asyncHandler from 'express-async-handler';

import Customer from '../customer/customer.model.js';
import EwayBill from './ewaybill.model.js';
import TransporterEwayBillCache from './transporter-ewaybill-cache.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Tenant from '../tenant/tenant.model.js';
import {
  getWhitebooksEwayBill,
  getWhitebooksEwayBillsForTransporter,
  getWhitebooksEwayBillsForTransporterByState,
} from './ewaybill.util.js';

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

  // Check if we already have a successfully cached E-way Bill in our database
  try {
    const existing = await EwayBill.findOne({ tenant: req.tenant, ewayBillNo: String(number) });
    // Only use the cache if the payload already has pincode fields (post-Whitebooks normalization).
    // Older cache entries from MastersIndia/earlier normalization lack these fields, so we
    // fall through to re-fetch and overwrite with the corrected shape.
    const hasNewNormalization =
      existing?.payload?.pincode_of_consignor !== undefined ||
      existing?.payload?.pincode_of_consignee !== undefined;
    if (existing && existing.status === 'SUCCESS' && existing.payload && hasNewNormalization) {
      return res.status(200).json({
        ...existing.payload,
        results: {
          message: existing.payload,
        },
      });
    }
  } catch (err) {
    console.error('Failed to query existing EwayBill from database', err);
  }

  const gstin = tenant?.legalInfo?.gstNumber;

  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
  const cleanIp = String(rawIp).split(',')[0].trim();

  const payload = await getWhitebooksEwayBill(tenant, number, cleanIp);

  if (!payload || !payload.data) {
    return res.status(404).json({ message: 'E-Way Bill not found' });
  }

  const { data } = payload;

  // Normalize details for frontend prefill compatibility
  const normalizedMessage = {
    ...data,
    eway_bill_number: String(data.ewbNo || number),
    eway_bill_date: data.ewayBillDate || '',
    eway_bill_valid_date: data.validUpto || '',
    document_number: data.docNo || '',
    // Consignor address fields
    address1_of_consignor: data.fromAddr1 || '',
    address2_of_consignor: data.fromAddr2 || '',
    place_of_consignor: data.fromPlace || '',
    pincode_of_consignor: data.fromPincode ? String(data.fromPincode) : '',
    state_of_consignor: data.fromStateCode ? String(data.fromStateCode) : '',
    // Consignee address fields
    address1_of_consignee: data.toAddr1 || '',
    address2_of_consignee: data.toAddr2 || '',
    place_of_consignee: data.toPlace || '',
    pincode_of_consignee: data.toPincode ? String(data.toPincode) : '',
    state_of_supply: data.toStateCode ? String(data.toStateCode) : '',
    // Party names and GSTINs
    legal_name_of_consignee: data.toTrdName || '',
    gstin_of_consignee: data.toGstin || '',
    gstin_of_consignor: data.fromGstin || '',
    legal_name_of_consignor: data.fromTrdName || '',
    legal_name_of_supply: data.fromTrdName || '',
    userGstin: data.userGstin || data.fromGstin || '',
    // Route map extras
    transportation_distance: data.transDistance || data.transportation_distance || '',
    number_of_valid_days: data.validDays || data.number_of_valid_days || '',
    itemList: (data.itemList || []).map((item) => ({
      ...item,
      product_description: item.productDesc || '',
      taxable_amount: item.taxableAmount || 0,
    })),
    VehiclListDetails: (data.VehiclListDetails || []).map((v) => ({
      ...v,
      vehicle_number: v.vehicleNo || '',
    })),
  };

  // Persist successful fetch into EwayBill collection
  try {
    await EwayBill.findOneAndUpdate(
      { tenant: req.tenant, ewayBillNo: String(normalizedMessage.eway_bill_number) },
      {
        $set: {
          ewayBillNo: String(normalizedMessage.eway_bill_number),
          gstin,
          source: 'Whitebooks',
          status: 'SUCCESS',
          payload: normalizedMessage,
          fetchedAt: new Date(),
          tenant: req.tenant,
        },
      },
      { new: true, upsert: true },
    );
  } catch (err) {
    console.error('Failed to persist EwayBill', err);
  }

  res.status(200).json({
    ...normalizedMessage,
    results: {
      message: normalizedMessage,
    },
  });
});

export { getEwayBillByNumber };

// GET list of eway bills for transporter filtered by generated date
const getEwayBillsForTransporter = asyncHandler(async (req, res) => {
  const { generated_date: generatedDate, force } = req.query;

  if (!generatedDate) {
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


  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
  const cleanIp = String(rawIp).split(',')[0].trim();

  const isForceRefresh = force === 'true' || force === true;
  const CACHE_DURATION_MS = 60 * 60 * 1000; // 60 minutes cache validity

  let rawList = [];
  let cacheEntry = null;

  if (!isForceRefresh) {
    try {
      cacheEntry = await TransporterEwayBillCache.findOne({
        tenant: req.tenant,
        generatedDate,
        stateCode: null,
      });
      if (cacheEntry && (Date.now() - new Date(cacheEntry.fetchedAt).getTime() < CACHE_DURATION_MS)) {
        rawList = cacheEntry.ewayBills || [];
      }
    } catch (err) {
      console.error('Failed to read transporter ewaybill cache', err);
    }
  }

  const isCacheStaleOrMissing =
    !cacheEntry || (Date.now() - new Date(cacheEntry.fetchedAt).getTime() >= CACHE_DURATION_MS);

  if (isForceRefresh || isCacheStaleOrMissing) {
    try {
      const payload = await getWhitebooksEwayBillsForTransporter(
        tenant,
        generatedDate,
        cleanIp,
      );
      rawList = payload?.data || [];

      // Save/update cache
      cacheEntry = await TransporterEwayBillCache.findOneAndUpdate(
        { tenant: req.tenant, generatedDate, stateCode: null },
        {
          $set: {
            ewayBills: rawList,
            fetchedAt: new Date(),
            stateCode: null,
          },
        },
        { upsert: true, new: true },
      );
    } catch (err) {
      console.error('Failed to fetch transporter ewaybills from Whitebooks API', err);
      // Fallback to cache if one exists to survive external API outages
      if (cacheEntry) {
        console.warn('Falling back to expired cache entry');
        rawList = cacheEntry.ewayBills || [];
      } else {
        throw err; // Re-throw if no cache entry is available to fallback on
      }
    }
  }

  // Normalize the provider response to a list we can enrich
  const list = rawList.map((it) => ({
    ...it,
    eway_bill_number: String(it.ewbNo || ''),
    eway_bill_date: it.ewbDate || '',
    document_number: it.docNo || '',
    place_of_delivery: it.delPlace || '',
    gstin_of_generator: it.genGstin || '',
  }));

  // Collect lookups
  const gstins = [...new Set(
    list
      .map((it) => (it.gstin_of_generator ? String(it.gstin_of_generator) : null))
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
    const genGstin = normalize(it.gstin_of_generator || '');
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

  return res.status(200).json({
    results: {
      message: enriched,
    },
    data: enriched,
    fetchedAt: cacheEntry?.fetchedAt || new Date(),
  });
});

export { getEwayBillsForTransporter };

// GET list of eway bills for transporter filtered by generated date AND state code
const getEwayBillsForTransporterByState = asyncHandler(async (req, res) => {
  const { generated_date: generatedDate, state_code: stateCode, force } = req.query;

  if (!generatedDate) {
    return res.status(400).json({ message: 'generated_date is required (DD/MM/YYYY)' });
  }
  if (!stateCode) {
    return res.status(400).json({ message: 'state_code is required' });
  }

  const tenant = await Tenant.findById(req.tenant);
  if (!tenant) {
    return res.status(404).json({ message: 'Tenant not found' });
  }

  const integration = tenant?.integrations?.ewayBill;
  if (!integration?.enabled) {
    return res.status(400).json({ message: 'E-Way Bill not integrated' });
  }

  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
  const cleanIp = String(rawIp).split(',')[0].trim();

  const isForceRefresh = force === 'true' || force === true;
  const CACHE_DURATION_MS = 60 * 60 * 1000; // 60 minutes

  let rawList = [];
  let cacheEntry = null;

  if (!isForceRefresh) {
    try {
      cacheEntry = await TransporterEwayBillCache.findOne({
        tenant: req.tenant,
        generatedDate,
        stateCode,
      });
      if (cacheEntry && (Date.now() - new Date(cacheEntry.fetchedAt).getTime() < CACHE_DURATION_MS)) {
        rawList = cacheEntry.ewayBills || [];
      }
    } catch (err) {
      console.error('Failed to read transporter-by-state ewaybill cache', err);
    }
  }

  const isCacheStaleOrMissing =
    !cacheEntry || (Date.now() - new Date(cacheEntry.fetchedAt).getTime() >= CACHE_DURATION_MS);

  if (isForceRefresh || isCacheStaleOrMissing) {
    try {
      const payload = await getWhitebooksEwayBillsForTransporterByState(
        tenant,
        generatedDate,
        stateCode,
        cleanIp,
      );
      rawList = payload?.data || [];

      cacheEntry = await TransporterEwayBillCache.findOneAndUpdate(
        { tenant: req.tenant, generatedDate, stateCode },
        { $set: { ewayBills: rawList, fetchedAt: new Date() } },
        { upsert: true, new: true },
      );
    } catch (err) {
      console.error('Failed to fetch transporter-by-state ewaybills from Whitebooks API', err);
      if (cacheEntry) {
        console.warn('Falling back to expired cache entry for state', stateCode);
        rawList = cacheEntry.ewayBills || [];
      } else {
        throw err;
      }
    }
  }

  // Normalize
  const list = rawList.map((it) => ({
    ...it,
    eway_bill_number: String(it.ewbNo || ''),
    eway_bill_date: it.ewbDate || '',
    document_number: it.docNo || '',
    place_of_delivery: it.delPlace || '',
    gstin_of_generator: it.genGstin || '',
  }));

  const gstins = [...new Set(
    list.map((it) => (it.gstin_of_generator ? String(it.gstin_of_generator) : null)).filter(Boolean)
  )];
  const ewbNos = [...new Set(list.map((it) => String(it.eway_bill_number)).filter(Boolean))];

  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const gstinRegex = gstins.map((g) => new RegExp(`^${escapeRegExp(g)}$`, 'i'));

  const customers = await Customer.find(
    { tenant: req.tenant, GSTNo: { $in: gstinRegex } },
    { customerName: 1, GSTNo: 1 },
  ).lean();
  const normalize = (s = '') => s.toString().trim().toUpperCase();
  const customerByGST = new Map(
    customers.map((c) => [normalize(c.GSTNo), { id: String(c._id), name: c.customerName }]),
  );

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
    const genGstin = normalize(it.gstin_of_generator || '');
    const customer = customerByGST.get(genGstin) || null;
    const st = subtripByEwb.get(String(it.eway_bill_number)) || null;
    return { ...it, customer, hasSubtrip: !!st, subtrip: st };
  });

  return res.status(200).json({
    results: { message: enriched },
    data: enriched,
    fetchedAt: cacheEntry?.fetchedAt || new Date(),
  });
});

export { getEwayBillsForTransporterByState };
