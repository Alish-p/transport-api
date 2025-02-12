const mongoose = require("mongoose");

const installmentSchema = new mongoose.Schema({
  installmentNumber: Number,
  dueDate: Date,
  amount: Number,
  status: String,
  paymentDate: Date,
  paymentMode: String,
  transactionId: String,
  _id: mongoose.Schema.Types.ObjectId, // Add _id field
});

const loanSchema = new mongoose.Schema({
  borrowerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "borrowerType",
  },
  borrowerType: {
    type: String,
    enum: ["Driver", "Transporter"], // Casing should match with the model name
    required: true,
  },
  principalAmount: {
    type: Number,
    required: true,
  },
  interestRate: {
    type: Number, // Annual interest rate in percentage
    required: true,
  },
  tenure: {
    type: Number, // Total tenure in months
    required: true,
  },
  loanAmount: {
    type: Number, // Fixed EMI amount per month
    required: true,
  },
  totalAmount: {
    type: Number, // Total amount payable (principal + interest)
    required: true,
  },
  remainingBalance: {
    type: Number,
    required: true,
  },
  installmentDetails: [
    {
      installmentNumber: Number,
      dueDate: Date,
      amount: Number,
      status: {
        type: String,
        enum: ["Pending", "Paid", "Overdue"],
        default: "Pending",
      },
      paymentDate: Date,
      paymentMode: {
        type: String,
        enum: ["UPI", "Net Banking", "Credit Card", "Debit Card", "Cash"],
      },
      transactionId: String,
    },
  ],

  remarks: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Loan", loanSchema);
