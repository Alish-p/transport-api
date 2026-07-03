import asyncHandler from 'express-async-handler';

import GpsSnapshot from './gpsSnapshot.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';

const fetchGpsSnapshots = asyncHandler(async (req, res) => {
  const { vehicleNo } = req.params;
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ message: 'Both "from" and "to" query parameters are required' });
  }

  const query = addTenantToQuery(req, {
    vehicleNo,
    timestamp: { $gte: new Date(from), $lte: new Date(to) },
  });

  const snapshots = await GpsSnapshot.find(query).sort({ timestamp: 1 }).lean();

  res.status(200).json({ snapshots });
});

export { fetchGpsSnapshots };
