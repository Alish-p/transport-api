const asyncHandler = require("express-async-handler");
const Expense = require("../model/Expense");

// Create Expense
const createExpense = asyncHandler(async (req, res) => {
  const expense = new Expense({ ...req.body });
  const newExpense = await expense.save();

  res.status(201).json(newExpense);
});

// Fetch Expenses
const fetchExpenses = asyncHandler(async (req, res) => {
  const expenses = await Expense.find();
  res.status(200).json(expenses);
});

// Fetch Single Expense
const fetchExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);

  if (!expense) {
    res.status(404).json({ message: "Expense not found" });
    return;
  }

  res.status(200).json(expense);
});

// Update Expense
const updateExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  res.status(200).json(expense);
});

// Delete Expense
const deleteExpense = asyncHandler(async (req, res) => {
  await Expense.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: "Expense deleted successfully" });
});

module.exports = {
  createExpense,
  fetchExpenses,
  fetchExpense,
  updateExpense,
  deleteExpense,
};
