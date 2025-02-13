const Driver = require("../model/Driver");
const Transporter = require("../model/Transporter");
const Loan = require("../model/Loan");

const asyncHandler = require("express-async-handler");

// Function to validate borrower existence
const validateBorrower = async (borrowerId, borrowerType) => {
  if (borrowerType === "Driver") return await Driver.findById(borrowerId);
  if (borrowerType === "Transporter")
    return await Transporter.findById(borrowerId);
  return null;
};

// Create Loan for Driver or Transporter
const createLoan = asyncHandler(async (req, res) => {
  const {
    borrowerId,
    borrowerType,
    principalAmount,
    interestRate,
    tenure,
    remarks,
  } = req.body;

  console.log({ data: req.body });
  // Validate borrower
  const borrower = await validateBorrower(borrowerId, borrowerType);
  if (!borrower) {
    return res.status(404).json({ message: `${borrowerType} not found` });
  }

  // Calculate Loan Amount (Standard Loan formula)
  const monthlyRate = interestRate / 100 / 12;
  const installmentAmount =
    interestRate === 0
      ? principalAmount / tenure
      : (principalAmount * monthlyRate) / (1 - (1 + monthlyRate) ** -tenure);
  const totalAmount = installmentAmount * tenure;

  const loan = new Loan({
    borrowerId,
    borrowerType,
    principalAmount,
    interestRate,
    tenure,
    installmentAmount: installmentAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    remainingBalance: totalAmount.toFixed(2),
    remarks,
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
  });

  res.json(pendingLoans);
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

module.exports = {
  createLoan,
  fetchAllLoans,
  fetchLoanById,
  fetchPendingLoans,
  updateLoan,
  deleteLoan,
};
