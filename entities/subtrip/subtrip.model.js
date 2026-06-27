import { Schema, model } from 'mongoose';
import CounterModel from '../../model/Counter.js';
import { DRIVER_ADVANCE_GIVEN_BY_OPTIONS, FREIGHT_MODELS } from './subtrip.constants.js';

// subtrip Schema
const subtripSchema = new Schema({
  // Unique no for the subtrip
  subtripNo: { type: String, required: true },

  // Flag to identify empty trips
  isEmpty: { type: Boolean, default: false },

  // References to related entities
  tripId: { type: Schema.Types.ObjectId, ref: "Trip" },   // Trip reference will only be present for own vehicles
  driverId: { type: Schema.Types.ObjectId, ref: "Driver", required: true },
  vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
  customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
  expenses: [{ type: Schema.Types.ObjectId, ref: "Expense" }],
  advances: [{ type: Schema.Types.ObjectId, ref: "TransporterAdvance" }],

  // Route and logistics details
  loadingPoint: { type: String },
  unloadingPoint: { type: String },
  startDate: { type: Date, required: true },
  endDate: { type: Date },

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
  docs: [{ type: String }],

  // Weight-related details
  loadingWeight: { type: Number },
  unloadingWeight: { type: Number },
  shortageWeight: { type: Number },
  shortageAmount: { type: Number },

  // Financial details
  freightDetails: {
    freightModel: { type: String, enum: Object.values(FREIGHT_MODELS), default: FREIGHT_MODELS.PER_TON },
    rate: { type: Number },
    freightAmount: { type: Number },
    baseKm: { type: Number },
    startKm: { type: Number },
    endKm: { type: Number },
  },
  commissionDetails: {
    commissionRate: { type: Number },
    commissionAmount: { type: Number },
  },
  tds: { type: Number },

  // Fuel management (Fuel Intent)
  initialAdvanceDiesel: { type: Schema.Types.Mixed },
  initialAdvanceDieselUnit: { type: String, enum: ['litre', 'amount'], default: undefined },
  initialTripAdvance: { type: Schema.Types.Mixed }, // initial trip advance
  intentFuelPump: { type: Schema.Types.ObjectId, ref: "Pump" },
  driverAdvanceGivenBy: { type: String, enum: Object.values(DRIVER_ADVANCE_GIVEN_BY_OPTIONS) },

  // Status tracking
  subtripStatus: { type: String },

  // Electronic Proof of Delivery (EPOD)
  podSignature: { type: String },       // S3 URL of signature image
  podImages: [{ type: String }],        // S3 URLs of evidence images
  podSignedBy: { type: String },        // Name of the person who signed
  podSigneeMobile: { type: String },    // Mobile of the person who signed
  podSignedAt: { type: Date },          // Timestamp when signed
  podRemarks: { type: String },         // Optional remarks from consignee
  podGeoLocation: {
    latitude: { type: Number },
    longitude: { type: Number },
  },

  // Incase of any error
  hasError: { type: Boolean, default: false },
  errorRemarks: { type: String },
  remarks: { type: String },

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
}, { timestamps: true });

// Unique trip number per tenant
subtripSchema.index({ tenant: 1, subtripNo: 1 }, { unique: true });
subtripSchema.index({ vehicleId: 1, startDate: -1 });

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

export default model("Subtrip", subtripSchema);
