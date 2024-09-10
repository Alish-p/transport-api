const asyncHandler = require("express-async-handler");
const Expense = require("../model/Expense");
const Subtrip = require("../model/Subtrip");

// Create Expense

const createExpense = asyncHandler(async (req, res) => {
  const { expenseCategory, subtripId } = req.body;

  console.log({ expenseCategory, subtripId });

  if (expenseCategory === "subtrip") {
    const subtrip = await Subtrip.findById(subtripId);

    console.log({ subtrip });

    if (!subtrip) {
      res.status(404).json({ message: "Subtrip not found" });
      return;
    }

    const expense = new Expense({
      ...req.body,
      subtripId,
      tripId: subtrip.tripId,
    });
    const newExpense = await expense.save();

    console.log({ newExpense });

    subtrip.expenses.push(newExpense._id);
    await subtrip.save();

    res.status(201).json(newExpense);
  } else {
    // If expenseCategory is not "subtrip", create an expense without associating it with a subtrip
    const expense = new Expense({
      ...req.body,
    });
    const newExpense = await expense.save();

    res.status(201).json(newExpense);
  }
});

// Fetch Expenses
const fetchExpenses = asyncHandler(async (req, res) => {
  const expenses = await Expense.find()
    .populate("pumpCd")
    .populate("vehicleId");
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
