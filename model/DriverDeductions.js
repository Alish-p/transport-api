const { Schema, model } = require("mongoose");

const driverDeductionsSchema = new Schema({
  driverId: { type: String, required: true, ref: "Driver" },
  type: { type: String, enum: ["advance", "penalty"], required: true },
  amount: { type: Number, required: true },
  remarks: { type: String },
  issuedDate: { type: Date, default: Date.now },
  repaymentType: {
    type: String,
    enum: ["full", "installments"],
    required: true,
  },
  installments: { type: Number, default: 1 },
  remainingAmount: {
    type: Number,
    default: function () {
      return this.amount;
    },
  },
  remainingInstallments: { type: Number },
  installmentHistory: [{ type: Date }],
  status: {
    type: String,
    enum: ["pending", "paid", "partially-paid"],
    required: true,
    default: "pending",
  },
});

module.exports = model("DriverDeductions", driverDeductionsSchema);
