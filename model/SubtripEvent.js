const { Schema, model } = require("mongoose");

const subtripEventSchema = new Schema({
  subtripId: { type: String, ref: "Subtrip", required: true, index: true },
  eventType: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  details: Schema.Types.Mixed,
  user: {
    _id: { type: String, ref: "User" },
    name: String,
  },
  tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
});

module.exports = model("SubtripEvent", subtripEventSchema);
