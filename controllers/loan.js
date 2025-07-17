// controllers/loanController.js
const asyncHandler = require("express-async-handler");
const Loan = require("../model/Loan");
const { addTenantToQuery } = require("../Utils/tenant-utils");

/**
 * @route   GET /api/loans
 * @desc    Fetch all loans (Driver & Transporter)
 */
const fetchAllLoans = asyncHandler(async (req, res) => {
  const loans = await Loan.find({ tenant: req.tenant }).populate("borrowerId");
  res.status(200).json(loans);
});

/**
 * @route   GET /api/loans/:id
 * @desc    Fetch a single loan by ID
 */
const fetchLoanById = asyncHandler(async (req, res) => {
  const loan = await Loan.findOne({
    _id: req.params.id,
    tenant: req.tenant,
  }).populate("borrowerId");
  if (!loan) {
    res.status(404);
    throw new Error("Loan not found");
  }
  res.status(200).json(loan);
});

/**
 * @route   POST /api/loans
 * @desc    Create a new loan
 */
const createLoan = asyncHandler(async (req, res) => {
  const {
    borrowerId,
    borrowerType,
    principalAmount,
    interestRate,
    tenureMonths,
    disbursementDate,
    remarks,
  } = req.body;

  // minimal validation
  if (
    !borrowerId ||
    !borrowerType ||
    !principalAmount ||
    !tenureMonths ||
    !disbursementDate
  ) {
    res.status(400);
    throw new Error("Missing required loan fields");
  }

  const loan = new Loan({
    borrowerId,
    borrowerType,
    principalAmount,
    interestRate,
    tenureMonths,
    remarks,
    disbursementDate: new Date(disbursementDate),
    tenant: req.tenant,
  });

  await loan.save(); // pre-save hook will build EMI schedule
  res.status(201).json(loan);
});

/**
 * @route   PUT /api/loans/:id
 * @desc    Update loan terms or remarks
 */
const updateLoan = asyncHandler(async (req, res) => {
  const loan = await Loan.findOne({ _id: req.params.id, tenant: req.tenant });
  if (!loan) {
    res.status(404);
    throw new Error("Loan not found");
  }

  // allow updating only certain fields
  const updatable = ["interestRate", "remarks"];
  updatable.forEach((key) => {
    if (req.body[key] !== undefined) {
      loan[key] = req.body[key];
    }
  });

  await loan.save();
  res.status(200).json(loan);
});

/**
 * @route   DELETE /api/loans/:id
 * @desc    Delete a loan
 */
const deleteLoan = asyncHandler(async (req, res) => {
  const loan = await Loan.findOne({ _id: req.params.id, tenant: req.tenant });
  if (!loan) {
    res.status(404);
    throw new Error("Loan not found");
  }

  await loan.remove();
  res.status(200).json({ message: "Loan deleted" });
});

/**
 * @route   POST /api/loans/:id/repay
 * @desc    Make a repayment (any amount, any time or EMI)
 */
const repayLoan = asyncHandler(async (req, res) => {
  const { amount, paidDate, remarks } = req.body;
  if (amount == null) {
    res.status(400);
    throw new Error("`amount` is required for repayment");
  }

  const loan = await Loan.findOne({ _id: req.params.id, tenant: req.tenant });
  if (!loan) {
    res.status(404);
    throw new Error("Loan not found");
  }

  // Round both to 2 decimals
  const outstanding = Math.round(loan.outstandingBalance * 100) / 100;
  const payment = Math.round(amount * 100) / 100;

  if (payment > outstanding) {
    res.status(400);
    throw new Error(
      `Repayment amount (${payment.toFixed(
        2
      )}) exceeds outstanding balance (${outstanding.toFixed(2)}).`
    );
  }

  const paymentDate = paidDate ? new Date(paidDate) : new Date();

  // 1) record the payment
  loan.payments.push({
    paymentDate,
    amount,
    remarks,
  });

  // 2) apply it across installments (with rollover)
  loan.applyRepayment({ amount, paidDate: paymentDate });

  await loan.save();
  res.status(200).json(loan);
});

const deferNextInstallment = asyncHandler(async (req, res) => {
  const { deferredTo } = req.body;
  if (!deferredTo) {
    res.status(400);
    throw new Error("`deferredTo` date is required");
  }

  const date = new Date(deferredTo);
  if (isNaN(date)) {
    res.status(400);
    throw new Error("`deferredTo` must be a valid date");
  }

  const loan = await Loan.findOne({ _id: req.params.id, tenant: req.tenant });
  if (!loan) {
    res.status(404);
    throw new Error("Loan not found");
  }

  // find next pending installment
  const inst = loan.installments.find((i) => i.status === "pending");
  if (!inst) {
    res.status(400);
    throw new Error("No pending installment to defer");
  }

  // overwrite the installment's dueDate
  inst.dueDate = date;

  // update the loan-level nextDueDate
  loan.emi.nextDueDate = date;

  await loan.save();
  res.status(200).json(loan);
});

/**
 * @route   POST /api/loans/:id/defer-all
 * @desc    Defer all pending EMIs by a number of days
 * @body    { days: number }
 */
const deferAllInstallments = asyncHandler(async (req, res) => {
  const { days } = req.body;
  if (days == null || !Number.isInteger(days)) {
    res.status(400);
    throw new Error("`days` (integer) is required");
  }

  const loan = await Loan.findOne({ _id: req.params.id, tenant: req.tenant });
  if (!loan) {
    res.status(404);
    throw new Error("Loan not found");
  }

  const msShift = days * 24 * 60 * 60 * 1000;
  loan.installments.forEach((inst) => {
    if (inst.status !== "paid") {
      inst.dueDate = new Date(inst.dueDate.getTime() + msShift);
    }
  });

  // set nextDueDate to the first pending installment
  const next = loan.installments.find((i) => i.status === "pending");
  loan.emi.nextDueDate = next ? next.dueDate : null;

  await loan.save();
  res.status(200).json(loan);
});

// fetch pending loans
const fetchPendingLoans = asyncHandler(async (req, res) => {
  const { borrowerType, id } = req.params;
  if (!["Driver", "Transporter", "Employee"].includes(borrowerType)) {
    res.status(400);
    throw new Error("Invalid borrowerType");
  }
  const loans = await Loan.find({
    borrowerType,
    borrowerId: id,
    status: "active",
    tenant: req.tenant,
  }).populate("borrowerId");
  res.status(200).json(loans);
});

module.exports = {
  fetchAllLoans,
  fetchLoanById,
  createLoan,
  updateLoan,
  deleteLoan,
  repayLoan,
  fetchPendingLoans,
  deferNextInstallment,
  deferAllInstallments,
};
