const mongoose = require("mongoose");

const { Schema, model, Types } = mongoose;

// Remove any existing Loan model
if (mongoose.models.Loan) {
  delete mongoose.connection.models.Loan;
}
/**
 * Subdocument: one scheduled installment (EMI)
 */
const installmentSchema = new Schema(
  {
    installmentNumber: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    principalDue: { type: Number, required: true },
    interestDue: { type: Number, required: true },
    totalDue: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    paidAmount: { type: Number, default: 0 },
    paidDate: { type: Date },
    remarks: { type: String },
  },
  { _id: false }
);

/**
 * Subdocument: every payment made against the loan
 */
const paymentSchema = new Schema(
  {
    paymentDate: { type: Date, required: true, default: Date.now },
    amount: { type: Number, required: true },
    remarks: String,
  },
  { _id: true }
);

/**
 * Main Loan schema
 */
const loanSchema = new Schema(
  {
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

    principalAmount: { type: Number, required: true },
    interestRate: { type: Number, required: true }, // annual %
    tenureMonths: { type: Number, required: true },

    disbursementDate: { type: Date, required: true },

    emi: {
      amount: { type: Number, required: true },
      frequency: { type: String, enum: ["monthly"], default: "monthly" },
      nextDueDate: { type: Date },
    },

    totalAmount: { type: Number, required: true },
    outstandingBalance: { type: Number, required: true },

    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
    },

    installments: [installmentSchema],
    payments: [paymentSchema],

    remarks: String,
  },
  {
    timestamps: true,
  }
);

// Auto-generate installment schedule upon creation
loanSchema.pre("validate", function (next) {
  if (this.isNew) {
    const monthlyRate = this.interestRate / 12 / 100;
    const P = this.principalAmount;
    const n = this.tenureMonths;
    // standard annuity formula
    const EMI =
      (P * monthlyRate * Math.pow(1 + monthlyRate, n)) /
      (Math.pow(1 + monthlyRate, n) - 1);

    this.emi.amount = Math.round(EMI * 100) / 100;

    let balance = P;
    let totalPayment = 0;

    // clear any accidental prefill
    this.installments = [];

    for (let i = 1; i <= n; i++) {
      const interest = Math.round(balance * monthlyRate * 100) / 100;
      const principalComp = Math.round((EMI - interest) * 100) / 100;
      balance = Math.round((balance - principalComp) * 100) / 100;
      const dueAmount = principalComp + interest;
      totalPayment += dueAmount;

      this.installments.push({
        installmentNumber: i,
        dueDate: new Date(
          this.disbursementDate.getTime() + i * 30 * 24 * 60 * 60 * 1000 // you can refine month calc
        ),
        principalDue: principalComp,
        interestDue: interest,
        totalDue: dueAmount,
      });
    }

    // now set the fields that were “required”
    this.totalAmount = Math.round(totalPayment * 100) / 100;
    this.outstandingBalance = this.totalAmount;
    this.emi.nextDueDate = this.installments[0].dueDate;
  }
  next();
});

loanSchema.methods.applyRepayment = function ({ amount, paidDate }) {
  let remaining = amount;
  const insts = this.installments;

  // Determine starting index:
  let idx = -1;
  // No valid number given → first pending installment
  idx = insts.findIndex((i) => i.status === "pending");
  if (idx < 0) return; // nothing to pay

  // Distribute the payment across installments
  for (let i = idx; i < insts.length && remaining > 0; i++) {
    const inst = insts[i];
    const due = inst.totalDue - (inst.paidAmount || 0);
    if (due <= 0) continue;

    if (remaining >= due) {
      inst.paidAmount = inst.totalDue;
      inst.status = "paid";
      inst.paidDate = paidDate;
      remaining -= due;
    } else {
      inst.paidAmount = (inst.paidAmount || 0) + remaining;
      // status stays 'pending'
      inst.paidDate = paidDate;
      remaining = 0;
    }
  }

  // Update global balance
  this.outstandingBalance = Math.max(0, this.outstandingBalance - amount);

  // Advance nextDueDate or close the loan
  const next = insts.find((i) => i.status === "pending");
  if (next) {
    this.emi.nextDueDate = next.dueDate;
    this.status = "active";
  } else {
    this.status = "closed";
    this.emi.nextDueDate = null;
  }
};

module.exports = model("Loan", loanSchema);
