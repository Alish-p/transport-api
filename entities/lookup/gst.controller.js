import asyncHandler from 'express-async-handler';
import Tenant from '../tenant/tenant.model.js';
import {
  fetchGstDetails,
  normalizeGstCanonical,
} from '../../helpers/gst.js';

// Generic GST lookup — usable across forms (customer/transporter/tenant)
export const gstLookupGeneric = asyncHandler(async (req, res) => {
  const { gstin } = req.body || {};
  const s = String(gstin || '').trim();
  if (!s) {
    return res.status(400).json({ message: 'gstin is required' });
  }
  if (!/^[0-9A-Z]{15}$/i.test(s)) {
    return res.status(400).json({ message: 'Invalid GSTIN format' });
  }

  // Require tenant integration flag
  const tenant = await Tenant.findById(req.tenant).select('integrations');
  const enabled = tenant?.integrations?.gstApi?.enabled;
  if (!enabled) {
    return res.status(400).json({ message: 'GST API integration is not enabled for this tenant' });
  }

  let raw;
  try {
    raw = await fetchGstDetails(s);
  } catch (err) {
    return res.status(502).json({ message: 'Failed to fetch from GST provider', error: err.message });
  }

  const canonical = normalizeGstCanonical(raw);

  // Return provider response (as-is) plus canonical normalization
  return res.status(200).json({
    response: raw?.response ?? raw,
    responseStatus: raw?.responseStatus ?? 'SUCCESS',
    message: raw?.message ?? null,
    canonical,
  });
});
