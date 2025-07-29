const { Schema, model } = require("mongoose");
const CounterModel = require("./Counter");

// Trip Schema
const tripSchema = new Schema({
  _id: { type: String, immutable: true, unique: true },
  driverId: { type: Schema.Types.ObjectId, ref: "Driver", required: true },
  vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
  tripStatus: { type: String, required: true }, // Billed or Pending
  fromDate: { type: Date, required: true },
  toDate: { type: Date },
  remarks: { type: String },
  subtrips: [{ type: String, ref: "Subtrip" }],
  tenant: {
    type: Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
    index: true,
  },
});

// for creating incremental id
tripSchema.pre("save", async function (next) {
  if (!this.isNew) {
    return next();
  }
  try {
    const counter = await CounterModel.findOneAndUpdate(
      { model: "Trip", tenant: this.tenant },
      { $inc: { seq: 1 }, $setOnInsert: { tenant: this.tenant, model: "Trip" } },
      { new: true, upsert: true }
    );

    const tripId = counter ? `t-${counter.seq}` : "t-1";
    this._id = tripId;
  } catch (error) {
    return next(error);
  }
});

module.exports = model("Trip", tripSchema);
