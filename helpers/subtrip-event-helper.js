const recordSubtripEvent = (subtrip, eventType, details = {}) => {
  if (!subtrip.events) {
    subtrip.events = [];
  }
  subtrip.events.push({
    eventType,
    timestamp: new Date(),
    details,
  });
};
module.exports = { recordSubtripEvent };
