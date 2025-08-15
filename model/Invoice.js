import { Schema, model } from 'mongoose';
import { INVOICE_STATUS } from '../constants/status.js';

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
    totalTax: { type: Number, default: 0 }, // Optional: sum of all tax amounts
  },
  { _id: false }
);

const subtripSnapshotSchema = new Schema(
  {
    subtripId: { type: String, ref: "Subtrip", required: true },
    consignee: String,
    unloadingPoint: String,
    vehicleNo: String,
    diNumber: String,
    rate: Number,
    loadingWeight: Number,
    materialType: String,
    shortageWeight: Number,
    shortageAmount: Number,
    freightAmount: Number,
    totalAmount: Number,
    startDate: Date,
    invoiceNo: String,
  },
  { _id: false }
);

const paymentSchema = new Schema(
  {
    amount: { type: Number, required: true },
    paidAt: { type: Date, default: Date.now },
    paidBy: { type: Schema.Types.ObjectId, ref: "User" },
    referenceNumber: { type: String, requied: true },
  },
  { _id: false }
);

const invoiceSchema = new Schema(
  {
    invoiceNo: { type: String, unique: true, index: true }, // e.g., INV-101
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    invoiceStatus: {
      type: String,
      enum: Object.values(INVOICE_STATUS),
      default: INVOICE_STATUS.PENDING,
      index: true,
    },

    // Invoice dates
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date },

    // Financials
    totalAmountBeforeTax: { type: Number, default: 0 },
    totalAfterTax: { type: Number, default: 0 },
    netTotal: { type: Number, default: 0 },
    totalReceived: { type: Number, default: 0 },

    // Tax & charges
    taxBreakup: taxBreakupSchema,
    additionalCharges: [
      {
        label: String,
        amount: Number,
      },
    ],

    payments: [paymentSchema],

    // Hybrid referencing
    invoicedSubTrips: [{ type: String, ref: "Subtrip" }],
    subtripSnapshot: [subtripSnapshotSchema],

    // Optional metadata
    notes: String,
    meta: {
      createdBy: {
        _id: { type: Schema.Types.ObjectId, ref: "User" },
        name: String,
      },
      lastModified: { type: Date },
    },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

invoiceSchema.pre("save", function (next) {
  const totalPaid = (this.payments || []).reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  );

  if (totalPaid > this.netTotal) {
    return next(new Error("Total payments exceed invoice amount"));
  }

  if (totalPaid === 0) {
    this.invoiceStatus = INVOICE_STATUS.PENDING;
  } else if (totalPaid < this.netTotal) {
    this.invoiceStatus =
      this.dueDate && this.dueDate < new Date()
        ? INVOICE_STATUS.OVERDUE
        : INVOICE_STATUS.PARTIAL_RECEIVED;
  } else {
    this.invoiceStatus = INVOICE_STATUS.RECEIVED;
  }

  next();
});

export default model("Invoice", invoiceSchema);
