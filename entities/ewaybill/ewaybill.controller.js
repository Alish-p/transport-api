/* eslint-disable perfectionist/sort-imports */
import asyncHandler from 'express-async-handler';

import Customer from '../customer/customer.model.js';
import EwayBill from './ewaybill.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Tenant from '../tenant/tenant.model.js';
import {
  getWhitebooksEwayBillsForTransporter,
  getWhitebooksEwayBill,
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

  const gstin = tenant?.legalInfo?.gstNumber;

  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
  const cleanIp = String(rawIp).split(',')[0].trim();

  console.log('Fetching Single E-Way Bill for Tenant:', tenant._id, 'GSTIN:', gstin, 'EWB No:', number, 'IP:', cleanIp);
  const payload = await getWhitebooksEwayBill(gstin, number, cleanIp);
  console.log('Whitebooks single payload retrieved:', JSON.stringify(payload));

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
    address1_of_consignor: data.fromAddr1 || '',
    place_of_consignor: data.fromPlace || '',
    place_of_consignee: data.toPlace || '',
    legal_name_of_consignee: data.toTrdName || '',
    gstin_of_consignee: data.toGstin || '',
    gstin_of_consignor: data.fromGstin || '',
    legal_name_of_consignor: data.fromTrdName || '',
    legal_name_of_supply: data.fromTrdName || '',
    userGstin: data.userGstin || data.fromGstin || '',
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
  const { generated_date: generatedDate } = req.query;

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

  const gstin = tenant?.legalInfo?.gstNumber;

  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
  const cleanIp = String(rawIp).split(',')[0].trim();

  console.log('Fetching E-Way Bills for Tenant:', tenant._id, 'GSTIN:', gstin, 'Date:', generatedDate, 'IP:', cleanIp);
  const payload = await getWhitebooksEwayBillsForTransporter(
    gstin,
    generatedDate,
    cleanIp,
  );
  console.log('Whitebooks payload retrieved:', JSON.stringify(payload));

  // Extract raw list from Whitebooks data
  const rawList = payload?.data || [];
  console.log('rawList length extracted:', rawList.length);

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
  });
});

export { getEwayBillsForTransporter };

