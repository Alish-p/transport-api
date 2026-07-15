import { model, Schema } from 'mongoose';

const subtripEventSchema = new Schema({
  subtripId: { type: Schema.Types.ObjectId, ref: "Subtrip", required: true, index: true },
  eventType: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  displayMessage: { type: String },
  details: Schema.Types.Mixed,
  user: {
    _id: { type: String, ref: "User" },
    name: String,
  },
  tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
});

export default model("SubtripEvent", subtripEventSchema);
