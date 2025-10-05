import { Schema, model } from 'mongoose';
import CounterModel from '../../model/Counter.js';

// subtrip Schema
const subtripSchema = new Schema({
  // Unique no for the subtrip
  subtripNo: { type: String, required: true },

  // Flag to identify empty trips
  isEmpty: { type: Boolean, default: false },

  // References to related entities
  // Trip reference will only be present for own vehicles
  tripId: { type: Schema.Types.ObjectId, ref: "Trip" },
  driverId: { type: Schema.Types.ObjectId, ref: "Driver", required: true },
  vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
  routeCd: { type: Schema.Types.ObjectId, ref: "Route" },
  customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
  expenses: [{ type: Schema.Types.ObjectId, ref: "Expense" }],

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
  // Optional reference to another subtrip number
  referenceSubtripNo: { type: String },
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
  initialTripAdvance: { type: Schema.Types.Mixed }, // initial trip advance
  intentFuelPump: { type: Schema.Types.ObjectId, ref: "Pump" },
  driverAdvanceGivenBy: { type: String },

  // Status tracking
  subtripStatus: { type: String },

  // Incase of any error
  hasError: { type: Boolean, default: false },
  errorRemarks: { type: String },

  // Billing details
  invoiceId: { type: String, ref: "Invoice" },
  driverSalaryId: { type: String, ref: "DriverSalary" },
  transporterPaymentReceiptId: { type: String, ref: "TransporterPayment" },
  tenant: {
    type: Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
    index: true,
  },
});

// Unique trip number per tenant
subtripSchema.index({ tenant: 1, subtripNo: 1 }, { unique: true });

// for creating incremental id
subtripSchema.pre("validate", async function (next) {
  if (!this.isNew) {
    return next();
  }
  try {
    const counterQuery = CounterModel.findOneAndUpdate(
      { model: "Subtrip", tenant: this.tenant },
      { $inc: { seq: 1 }, $setOnInsert: { tenant: this.tenant, model: "Subtrip" } },
      { new: true, upsert: true }
    );

    const session = this.$session();
    if (session) {
      counterQuery.session(session);
    }

    const counter = await counterQuery;

    const subtripNo = counter ? `st-${counter.seq}` : "st-1";
    this.subtripNo = this.subtripNo || subtripNo;
  } catch (error) {
    return next(error);
  }
});

// for locking once subtrip is closed
subtripSchema.pre("save", function (next) {
  // If no modifications, proceed

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

export default model("Subtrip", subtripSchema);
