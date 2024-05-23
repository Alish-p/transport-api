const asyncHandler = require("express-async-handler");
const Bank = require("../model/Bank");

// Create Bank
const createBank = asyncHandler(async (req, res) => {
  const bank = new Bank({ ...req.body });
  const newBank = await bank.save();

  res.status(201).json(newBank);
});

// Fetch Banks
const fetchBanks = asyncHandler(async (req, res) => {
  const banks = await Bank.find();
  res.status(200).json(banks);
});

// Update Bank
const updateBank = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const bank = await Bank.findByIdAndUpdate(id, req.body, { new: true });

  res.status(200).json(bank);
});

// Delete Bank
const deleteBank = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const bank = await Bank.findByIdAndDelete(id);

  res.status(200).json(bank);
});

module.exports = {
  createBank,
  fetchBanks,
  updateBank,
  deleteBank,
};
