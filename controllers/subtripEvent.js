const asyncHandler = require("express-async-handler");
const SubtripEvent = require("../model/SubtripEvent");
const { addTenantToQuery } = require("../utills/tenant-utils");

const fetchSubtripEvents = asyncHandler(async (req, res) => {
  const { subtripId } = req.params;
  const events = await SubtripEvent.find(
    addTenantToQuery(req, { subtripId })
  ).sort({ timestamp: 1 });
  res.status(200).json(events);
});

module.exports = {
  fetchSubtripEvents,
};
