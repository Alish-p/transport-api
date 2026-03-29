import mongoose from 'mongoose';
import CounterModel from '../../model/Counter.js';

const { Schema, model, Types } = mongoose;


/**
 * Subdocument: every payment made against the loan
 */
const paymentSchema = new Schema(
  {
    paymentDate: { type: Date, required: true, default: Date.now },
    amount: { type: Number, required: true },
    source: { type: String }, // e.g. "Driver Salary DSR-5", "Transporter Payment TPR-3", "Manual"
    remarks: String,
  },
  { _id: true }
);

/**
 * Simplified Loan schema
 * Just tracks: loan amount, payments, outstanding balance
 */
const loanSchema = new Schema(
  {
    loanNo: { type: String, required: true },
    borrowerId: {
      type: Types.ObjectId,
      required: true,
      refPath: "borrowerType",
    },
    borrowerType: {
      type: String,
      required: true,
      enum: ["Driver", "Transporter", "Employee"],
    },

    tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },

    principalAmount: { type: Number, required: true },
    disbursementDate: { type: Date, required: true },
    outstandingBalance: { type: Number, required: true },

    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
    },

    payments: [paymentSchema],
    remarks: String,
  },
  {
    timestamps: true,
  }
);

// Unique loan number per tenant
loanSchema.index({ tenant: 1, loanNo: 1 }, { unique: true });

// Set outstandingBalance = principalAmount on creation and calculate loanNo
loanSchema.pre("validate", async function (next) {
  if (!this.isNew) return next();

  this.outstandingBalance = this.principalAmount;

  try {
    const counterQuery = CounterModel.findOneAndUpdate(
      { model: "Loan", tenant: this.tenant },
      { $inc: { seq: 1 }, $setOnInsert: { tenant: this.tenant, model: "Loan" } },
      { new: true, upsert: true }
    );

    const session = this.$session();
    if (session) {
      counterQuery.session(session);
    }

    const counter = await counterQuery;
    const loanNo = counter ? `LN-${counter.seq}` : "LN-1";
    this.loanNo = this.loanNo || loanNo;
    next();
  } catch (error) {
    return next(error);
  }
});

export default model("Loan", loanSchema);
