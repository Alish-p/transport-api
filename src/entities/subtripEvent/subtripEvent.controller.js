import asyncHandler from 'express-async-handler';
import SubtripEvent from './subtripEvent.model.js';
import { addTenantToQuery } from '../../../utills/tenant-utils.js';

const fetchSubtripEvents = asyncHandler(async (req, res) => {
  const { subtripId } = req.params;
  const events = await SubtripEvent.find(
    addTenantToQuery(req, { subtripId })
  ).sort({ timestamp: 1 });
  res.status(200).json(events);
});

export { fetchSubtripEvents };
