const asyncHandler = require("express-async-handler");
const SubtripEvent = require("../model/SubtripEvent");

const fetchSubtripEvents = asyncHandler(async (req, res) => {
  const { subtripId } = req.params;
  const events = await SubtripEvent.find({ subtripId }).sort({ timestamp: 1 });
  res.status(200).json(events);
});

module.exports = {
  fetchSubtripEvents,
};
