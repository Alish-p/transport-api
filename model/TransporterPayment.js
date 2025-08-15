import { Schema, model } from 'mongoose';
import CounterModel from './Counter.js';

//
// 📦 Tax Breakup Schema — Captures GST details for audit compliance
//
const taxBreakupSchema = new Schema(
  {
    cgst: {
      rate: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
    },
    sgst: {
      rate: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
    },
    igst: {
      rate: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
    },
    tds: {
      rate: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
    },

    totalTax: { type: Number, default: 0 },
  },
  { _id: false }
);

//
// 🧾 Subtrip Snapshot Schema — Freezes subtrip details at time of payment
//
const subtripPaymentSnapshotSchema = new Schema(
  {
    subtripId: { type: String, ref: "Subtrip", required: true },

    // Route info
    loadingPoint: String,
    unloadingPoint: String,
    vehicleNo: String,
    startDate: Date,

    // Party info
    customerName: String,
    invoiceNo: String,

    // Financial info
    rate: Number,
    commissionRate: Number,
    effectiveFreightRate: Number,
    loadingWeight: Number,
    freightAmount: Number,
    shortageWeight: Number,
    shortageAmount: Number,

    // Expenses and final payment
    expenses: [
      {
        expenseType: String,
        amount: Number,
        remarks: String,
      },
    ],
    totalExpense: Number,
    totalTransporterPayment: Number,
  },
  { _id: false }
);

//
// 💰 Transporter Payment Receipt Schema — Main document for transporter settlements
//
const transporterPaymentReceiptSchema = new Schema(
  {
    // Unique identifier
    paymentId: { type: String, immutable: true, unique: true },

    // Transporter reference
    transporterId: {
      type: Schema.Types.ObjectId,
      ref: "Transporter",
      required: true,
    },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },

    // Status of the payment
    status: {
      type: String,
      enum: ["generated", "paid"],
      default: "generated",
    },

    // Timestamp fields
    issueDate: { type: Date, default: Date.now },

    // Subtrip linkage and snapshot
    associatedSubtrips: [{ type: String, ref: "Subtrip" }],
    subtripSnapshot: [subtripPaymentSnapshotSchema],

    // Charges beyond calculated freight
    additionalCharges: [
      {
        label: String,
        amount: Number,
      },
    ],

    // Tax details for audit
    taxBreakup: taxBreakupSchema,

    // Summary of computed values
    summary: {
      totalTripWiseIncome: Number,
      totalFreightAmount: Number,
      totalExpense: Number,
      totalShortageAmount: Number,
      totalTax: Number,
      totalAdditionalCharges: Number,
      netIncome: Number, // totaltotalTripWiseIncome-totalExpense-totalShortageAmount-totalTax-additionalCharges
    },

    // Creator and last modifier info
    meta: {
      createdBy: {
        _id: { type: Schema.Types.ObjectId, ref: "User" },
        name: String,
      },
      lastModified: Date,
    },
  },
  {
    timestamps: true,
  }
);

//
// 🔁 Auto-generate paymentId before saving
//
transporterPaymentReceiptSchema.pre("save", async function (next) {
  if (!this.isNew) return next();

  try {
    const counter = await CounterModel.findOneAndUpdate(
      { model: "TransporterPayment", tenant: this.tenant },
      { $inc: { seq: 1 }, $setOnInsert: { tenant: this.tenant, model: "TransporterPayment" } },
      { new: true, upsert: true }
    );

    this.paymentId = `TPR-${counter.seq}`;
  } catch (err) {
    return next(err);
  }

  this.meta = this.meta || {};
  this.meta.lastModified = new Date();
  next();
});

export default model("TransporterPayment", transporterPaymentReceiptSchema);
