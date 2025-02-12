const Driver = require("../model/Driver");
const Transporter = require("../model/Transporter");
const Loan = require("../model/Loan");

const asyncHandler = require("express-async-handler");

// Function to validate borrower existence
const validateBorrower = async (borrowerId, borrowerType) => {
  if (borrowerType === "driver") return await Driver.findById(borrowerId);
  if (borrowerType === "transporter")
    return await Transporter.findById(borrowerId);
  return null;
};

// Create Loan for Driver or Transporter
const createLoan = asyncHandler(async (req, res) => {
  const { borrowerId, borrowerType, principalAmount, interestRate, tenure } =
    req.body;

  // Validate borrower
  const borrower = await validateBorrower(borrowerId, borrowerType);
  if (!borrower) {
    return res.status(404).json({ message: `${borrowerType} not found` });
  }

  // Calculate Loan Amount (Standard Loan formula)
  const monthlyRate = interestRate / 100 / 12;
  const emiAmount =
    interestRate === 0
      ? principalAmount / tenure
      : (principalAmount * monthlyRate) / (1 - (1 + monthlyRate) ** -tenure);
  const totalAmount = emiAmount * tenure;

  // Generate installment schedule
  const installmentDetails = [];
  let remainingBalance = totalAmount;
  for (let i = 1; i <= tenure; i++) {
    installmentDetails.push({
      installmentNumber: i,
      dueDate: new Date(new Date().setMonth(new Date().getMonth() + i)),
      amount: emiAmount.toFixed(2),
      status: "Pending",
    });
  }

  const loan = new Loan({
    borrowerId,
    borrowerType,
    principalAmount,
    interestRate,
    tenure,
    emiAmount: emiAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    remainingBalance: totalAmount.toFixed(2),
    installmentDetails,
  });

  const newLoan = await loan.save();
  res.status(201).json(newLoan);
});

// Fetch all Loans (both Driver & Transporter)
const fetchAllLoans = asyncHandler(async (req, res) => {
  const loans = await Loan.find().populate("borrowerId");
  res.status(200).json(loans);
});

// Fetch a single Loan by ID
const fetchLoanById = asyncHandler(async (req, res) => {
  const loan = await Loan.findById(req.params.id).populate("borrowerId");
  if (!loan) return res.status(404).json({ message: "Loan not found" });
  res.status(200).json(loan);
});

// Fetch pending Loans for a specific borrower (Driver or Transporter)
const fetchPendingLoans = asyncHandler(async (req, res) => {
  const { borrowerType, id } = req.params;
  const pendingLoans = await Loan.find({
    borrowerId: id,
    borrowerType,
    remainingBalance: { $gt: 0 },
  }).populate("borrowerId");

  res.json(pendingLoans);
});

// Function to fetch the *next* pending installment for a borrower
const fetchNextPendingInstallment = asyncHandler(async (req, res) => {
  const { borrowerType, id } = req.params;

  const loan = await Loan.findOne({
    borrowerId: id,
    borrowerType,
    "installmentDetails.status": "Pending",
  }).sort({ "installmentDetails.installmentNumber": 1 });

  if (!loan) {
    return res.json({
      message: "No pending installments found",
      installment: null,
      loan: null,
    }); // No pending installments
  }

  const nextInstallment = loan.installmentDetails.find(
    (installment) => installment.status === "Pending"
  );

  res.json({ installment: nextInstallment, loan: loan });
});

// Update Loan details
const updateLoan = asyncHandler(async (req, res) => {
  const updatedLoan = await Loan.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });

  if (!updatedLoan) return res.status(404).json({ message: "Loan not found" });

  res.status(200).json(updatedLoan);
});

// Delete an Loan record
const deleteLoan = asyncHandler(async (req, res) => {
  const deletedLoan = await Loan.findByIdAndDelete(req.params.id);
  if (!deletedLoan) return res.status(404).json({ message: "Loan not found" });

  res.status(200).json(deletedLoan);
});

// Process Loan repayment
const repayLoan = async (req, res) => {
  try {
    const { amountPaid, paymentMode, transactionId } = req.body;
    const emi = await Loan.findById(req.params.id);

    if (!emi) return res.status(404).json({ message: "Loan not found" });

    let updatedBalance = emi.remainingBalance - amountPaid;
    let isOverpaid = updatedBalance < 0;

    // Update installment details
    let paymentProcessed = false;
    emi.installmentDetails = emi.installmentDetails.map((installment) => {
      if (!paymentProcessed && installment.status === "Pending") {
        installment.status = "Paid";
        installment.paymentDate = new Date();
        installment.paymentMode = paymentMode;
        installment.transactionId = transactionId;
        paymentProcessed = true;
      }
      return installment;
    });

    emi.remainingBalance = isOverpaid ? 0 : updatedBalance.toFixed(2);
    await emi.save();

    res.json({ message: "Loan repayment successful", emi });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createLoan,
  fetchAllLoans,
  fetchLoanById,
  fetchPendingLoans,
  fetchNextPendingInstallment,
  updateLoan,
  deleteLoan,
  repayLoan,
};
