const asyncHandler = require("express-async-handler");
const Expense = require("../model/Expense");
const Subtrip = require("../model/Subtrip");

// Create Expense

const createExpense = asyncHandler(async (req, res) => {
  const { expenseCategory, subtripId } = req.body;

  if (expenseCategory === "subtrip") {
    const subtrip = await Subtrip.findById(subtripId);

    if (!subtrip) {
      res.status(404).json({ message: "Subtrip not found" });
      return;
    }

    const expense = new Expense({
      ...req.body,
      subtripId,
      tripId: subtrip.tripId,
      vehicleId: subtrip.tripId.vehicleId,
    });
    const newExpense = await expense.save();

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

// Fetch Expenses with flexible querying
const fetchExpenses = asyncHandler(async (req, res) => {
  try {
    const {
      tripId,
      subtripId,
      vehicleId,
      pumpCd,
      expenseType,
      expenseCategory,
      fromDate,
      toDate,
      paidThrough,
      authorisedBy,
    } = req.query;

    let query = {};

    // Trip filter
    if (tripId) {
      query.tripId = tripId;
    }

    // Subtrip filter
    if (subtripId) {
      query.subtripId = subtripId;
    }

    // Vehicle filter
    if (vehicleId) {
      query.vehicleId = vehicleId;
    }

    // Pump filter
    if (pumpCd) {
      query.pumpCd = pumpCd;
    }

    // Expense type filter
    if (expenseType) {
      query.expenseType = expenseType;
    }

    // Expense category filter
    if (expenseCategory) {
      query.expenseCategory = expenseCategory;
    }

    // Date range filter
    if (fromDate && toDate) {
      query.date = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    }

    // Payment method filter
    if (paidThrough) {
      query.paidThrough = paidThrough;
    }

    // Authorizer filter
    if (authorisedBy) {
      query.authorisedBy = authorisedBy;
    }

    // Execute the query with population
    const expenses = await Expense.find(query)
      .populate("pumpCd")
      .populate("vehicleId")
      .populate("tripId")
      .populate("subtripId")
      .sort({ date: -1 }); // Sort by date in descending order

    if (!expenses.length) {
      return res.status(404).json({
        message: "No expenses found for the specified criteria.",
      });
    }

    res.status(200).json(expenses);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching expenses",
      error: error.message,
    });
  }
});

// Fetch Single Expense
const fetchExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id)
    .populate("vehicleId")
    .populate("pumpCd");

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
