const asyncHandler = require("express-async-handler");
const DriverDeductions = require("../model/DriverDeductions");

// Create Driver Deduction
const createDriverDeduction = asyncHandler(async (req, res) => {
  const driverDeduction = new DriverDeductions({ ...req.body });
  const newDeduction = await driverDeduction.save();

  res.status(201).json(newDeduction);
});

// Fetch All Driver Deductions
const fetchDriverDeductions = asyncHandler(async (req, res) => {
  const deductions = await DriverDeductions.find().populate("driverId");
  res.status(200).json(deductions);
});

// Fetch Single Driver Deduction by ID
const fetchDriverDeduction = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const deduction = await DriverDeductions.findById(id).populate("driverId");

  if (!deduction) {
    res.status(404);
    throw new Error("Deduction not found");
  }

  res.status(200).json(deduction);
});

// Update Driver Deduction
const updateDriverDeduction = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const updatedDeduction = await DriverDeductions.findByIdAndUpdate(
    id,
    req.body,
    { new: true }
  );

  if (!updatedDeduction) {
    res.status(404);
    throw new Error("Deduction not found");
  }

  res.status(200).json(updatedDeduction);
});

// Repayment Driver Deduction
const repaymentDriverDeduction = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { paymentAmount } = req.body;

  const deduction = await DriverDeductions.findById(id);

  if (!deduction) {
    res.status(404);
    throw new Error("Deduction not found");
  }

  deduction.remainingAmount -= paymentAmount;
  deduction.installmentHistory.push(new Date());

  if (deduction.remainingAmount <= 0) {
    deduction.status = "paid";
    deduction.remainingAmount = 0;
    deduction.remainingInstallments = 0;
  } else {
    deduction.status = "partially-paid";
    deduction.remainingInstallments -= 1;
  }

  const updatedDeduction = await deduction.save();

  res.status(200).json(updatedDeduction);
});

// Delete Driver Deduction
const deleteDriverDeduction = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const deletedDeduction = await DriverDeductions.findByIdAndDelete(id);

  if (!deletedDeduction) {
    res.status(404);
    throw new Error("Deduction not found");
  }

  res
    .status(200)
    .json({ message: "Deduction deleted successfully", deletedDeduction });
});

module.exports = {
  createDriverDeduction,
  fetchDriverDeductions,
  fetchDriverDeduction,
  updateDriverDeduction,
  repaymentDriverDeduction,
  deleteDriverDeduction,
};
