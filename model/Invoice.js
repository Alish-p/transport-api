const { Schema, model } = require("mongoose");
const CounterModel = require("./Counter");

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
    rate: Number,
    loadingWeight: Number,
    shortageWeight: Number,
    shortageAmount: Number,
    freightAmount: Number,
    totalAmount: Number,
    startDate: Date,
    invoiceNo: String,
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
      enum: ["pending", "paid", "overdue"],
      default: "pending",
      index: true,
    },

    // Invoice dates
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    billingPeriod: {
      start: { type: Date },
      end: { type: Date },
    },

    // Financials
    totalAmountBeforeTax: { type: Number, default: 0 },
    totalAfterTax: { type: Number, default: 0 },

    // Tax & charges
    taxBreakup: taxBreakupSchema,
    additionalCharges: [
      {
        label: String,
        amount: Number,
      },
    ],

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
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// Invoice number generator
invoiceSchema.pre("save", async function (next) {
  if (this.isNew && !this.invoiceNo) {
    try {
      const counter = await CounterModel.findByIdAndUpdate(
        { _id: "InvoiceId" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.invoiceNo = `INV-${counter.seq}`;
    } catch (err) {
      return next(err);
    }
  }
  this.meta = this.meta || {};
  this.meta.lastModified = new Date();
  next();
});

module.exports = model("Invoice", invoiceSchema);
