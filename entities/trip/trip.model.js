import { Schema, model } from 'mongoose';
import CounterModel from '../../model/Counter.js';

// Trip Schema
const tripSchema = new Schema({
  tripNo: { type: String, required: true },
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

// Unique trip number per tenant
tripSchema.index({ tenant: 1, tripNo: 1 }, { unique: true });

// for creating incremental id
tripSchema.pre("validate", async function (next) {
  if (!this.isNew) {
    return next();
  }
  try {
    const counterQuery = CounterModel.findOneAndUpdate(
      { model: "Trip", tenant: this.tenant },
      { $inc: { seq: 1 }, $setOnInsert: { tenant: this.tenant, model: "Trip" } },
      { new: true, upsert: true }
    );

    const session = this.$session();
    if (session) {
      counterQuery.session(session);
    }

    const counter = await counterQuery;

    const tripNo = counter ? `t-${counter.seq}` : "t-1";
    this.tripNo = this.tripNo || tripNo;
  } catch (error) {
    return next(error);
  }
});

export default model("Trip", tripSchema);
