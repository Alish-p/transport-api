const { Schema, model } = require("mongoose");
const CounterModel = require("./Counter");

// subtrip Schema
const subtripSchema = new Schema({
  _id: { type: String, immutable: true, unique: true },
  routeCd: { type: Schema.Types.ObjectId, ref: "Route", required: true },
  customerId: { type: String, required: true },
  loadingPoint: { type: String, required: true },
  unloadingPoint: { type: String, required: true },
  loadingWeight: { type: Number },
  unloadingWeight: { type: Number },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  startKm: { type: Number },
  endKm: { type: Number },
  rate: { type: Number },
  subtripStatus: { type: String },
  invoiceNo: { type: String },
  shipmentNo: { type: String },
  orderNo: { type: String },
  ewayBill: { type: String },
  ewayExpiryDate: { type: Date },
  materialType: { type: String },
  quantity: { type: Number },
  grade: { type: String },
  detentionTime: { type: Number },
  tds: { type: Number },
  deductedWeight: { type: Number },
  hasError: { type: Boolean, default: false },
  tripId: { type: String, ref: "Trip", required: true },
  expenses: [{ type: String, ref: "Expense" }],
});

// for creating incremental id
subtripSchema.pre("save", async function (next) {
  if (!this.isNew) {
    return next();
  }
  try {
    const counter = await CounterModel.findByIdAndUpdate(
      { _id: "SubtripId" },
      { $inc: { seq: 1 } },
      { upsert: true }
    );

    const subtripId = counter ? `st-${counter.seq}` : "st-1";
    this._id = subtripId;
  } catch (error) {
    return next(error);
  }
});

module.exports = model("Subtrip", subtripSchema);
