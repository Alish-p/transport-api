const { Schema, model } = require("mongoose");
const CounterModel = require("./Counter");

// subtrip Schema
const subtripSchema = new Schema({
  // Unique id for the subtrip
  _id: { type: String, immutable: true, unique: true },

  // References to related entities
  tripId: { type: String, ref: "Trip", required: true },
  routeCd: { type: Schema.Types.ObjectId, ref: "Route" },
  customerId: { type: String, required: true, ref: "Customer" },
  expenses: [{ type: String, ref: "Expense" }],

  // Route and logistics details
  loadingPoint: { type: String },
  unloadingPoint: { type: String },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  startKm: { type: Number },
  endKm: { type: Number },

  // Shipment and invoice details
  invoiceNo: { type: String },
  shipmentNo: { type: String },
  consignee: { type: String },
  orderNo: { type: String },
  ewayBill: { type: String },
  ewayExpiryDate: { type: Date },

  // Material details
  materialType: { type: String },
  quantity: { type: Number },
  grade: { type: String },
  diNumber: { type: String },

  // Weight-related details
  loadingWeight: { type: Number },
  unloadingWeight: { type: Number },
  shortageWeight: { type: Number },
  shortageAmount: { type: Number },

  // Financial details
  rate: { type: Number },
  commissionRate: { type: Number },
  tds: { type: Number },

  // Fuel management (Fuel Intent)
  initialAdvanceDiesel: { type: Schema.Types.Mixed },
  intentFuelPump: { type: Schema.Types.ObjectId, ref: "Pump" },

  // Status tracking
  subtripStatus: { type: String },

  // Incase of any error
  hasError: { type: Boolean, default: false },
  errorRemarks: { type: String },

  // Billing details
  invoiceId: { type: String, ref: "Invoice" },
  driverSalaryId: { type: String, ref: "DriverSalary" },
  transporterPaymentReceiptId: { type: String, ref: "TransporterPayment" },

  // Event history (timeline for tracking changes)
  events: [
    {
      eventType: String,
      timestamp: Date,
      details: Schema.Types.Mixed,
      user: {
        _id: { type: String, ref: "User" },
        name: String,
      },
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
