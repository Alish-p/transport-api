import { Schema, model } from 'mongoose';
import CounterModel from '../../model/Counter.js';

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
    totalDriverSalary: Number,
  },
  { _id: false }
);

const driverSalarySchema = new Schema({
  // Unique identifier
  paymentId: { type: String, immutable: true, unique: true },
  // Reference to the driver
  driverId: { type: Schema.Types.ObjectId, required: true, ref: "Driver" },
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

  // Billing period covered in this receipt
  billingPeriod: {
    start: { type: Date },
    end: { type: Date },
  },

  // Subtrip linkage and snapshot
  associatedSubtrips: [{ type: String, ref: "Subtrip" }],
  subtripSnapshot: [subtripPaymentSnapshotSchema],

  // Additional Paymments beyond trip salary
  additionalPayments: [
    {
      label: String,
      amount: Number,
    },
  ],
  additionalDeductions: [
    {
      label: String,
      amount: Number,
    },
  ],

  // Summary of computed values
  summary: {
    totalTripWiseIncome: Number,
    totalDeductions: Number,
    totalAdditionalPayments: Number,
    netIncome: Number, // totalTripWiseIncome+totalAdditionalPayments-totalDeductions
  },

  // Creator and last modifier info
  meta: {
    createdBy: {
      _id: { type: Schema.Types.ObjectId, ref: "User" },
      name: String,
    },
    lastModified: Date,
  },
});

// Pre-save middleware for creating incremental ID
driverSalarySchema.pre("save", async function (next) {
  if (!this.isNew) {
    return next();
  }
  try {
    const counter = await CounterModel.findOneAndUpdate(
      { model: "DriverSalary", tenant: this.tenant },
      { $inc: { seq: 1 }, $setOnInsert: { tenant: this.tenant, model: "DriverSalary" } },
      { new: true, upsert: true }
    );

    const Id = counter ? `DSR-${counter.seq}` : "DSR-1";
    this.paymentId = Id;
  } catch (error) {
    return next(error);
  }
});

export default model("DriverSalary", driverSalarySchema);
