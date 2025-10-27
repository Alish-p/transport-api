import asyncHandler from 'express-async-handler';
import Tenant from '../tenant/tenant.model.js';
import { getMastersIndiaEwayBill } from './ewaybill.util.js';
import EwayBill from './ewaybill.model.js';

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
