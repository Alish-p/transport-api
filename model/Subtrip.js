const { Schema, model } = require("mongoose");
const CounterModel = require("./Counter");

// subtrip Schema
const subtripSchema = new Schema({
  _id: { type: String, immutable: true, unique: true },
  routeCd: { type: Schema.Types.ObjectId, ref: "Route" },
  customerId: { type: String, required: true, ref: "Customer" },
  loadingPoint: { type: String },
  unloadingPoint: { type: String },
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
  consignee: { type: String },
  orderNo: { type: String },
  ewayBill: { type: String },
  ewayExpiryDate: { type: Date },
  materialType: { type: String },
  quantity: { type: Number },
  grade: { type: String },
  diNumber: { type: String },
  tds: { type: Number },
  deductedWeight: { type: Number },
  deductedAmount: { type: Number },
  hasError: { type: Boolean, default: false },
  initialDiesel: {
    type: Schema.Types.Mixed, // Can accept Number or FULL
  },
  tripId: { type: String, ref: "Trip", required: true },
  expenses: [{ type: String, ref: "Expense" }],

  events: [
    {
      eventType: String, // e.g., "CREATED", "MATERIAL_ADDED", "RECEIVED"
      timestamp: Date,
      details: Schema.Types.Mixed, // additional info, if needed
    },
  ],
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

// for locking once subtrip is closed
subtripSchema.pre("save", function (next) {
  // If no modifications, proceed

  console.log({
    modi: this.isModified("subtripStatus"),
    current: this.subtripStatus,
  });

  if (!this.isModified()) return next();

  // Allow updates only for transitioning to "closed"
  if (this.isModified("subtripStatus") && this.subtripStatus === "closed") {
    return next(); // Transition to "closed" is allowed
  }

  // If the subtrip is already closed, block further modifications
  if (this.subtripStatus === "closed") {
    return next(new Error("Closed subtrips cannot be modified."));
  }

  next(); // Allow other modifications
});

module.exports = model("Subtrip", subtripSchema);
