const { Schema, model } = require("mongoose");

// Trip Schema
const tripSchema = new Schema({
  driverId: { type: Schema.Types.ObjectId, ref: "Driver", required: true },
  vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
  tripStatus: { type: String, required: true },
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  remarks: { type: String },
  subtrips: [{ type: Schema.Types.ObjectId, ref: "Subtrip" }],
});

module.exports = model("Trip", tripSchema);
