const asyncHandler = require("express-async-handler");
const Expense = require("../model/Expense");
const Subtrip = require("../model/Subtrip");
const Vehicle = require("../model/Vehicle");
const { EXPENSE_CATEGORIES } = require("../constants/status");
const {
  recordSubtripEvent,
  SUBTRIP_EVENT_TYPES,
} = require("../helpers/subtrip-event-helper");

// Create Expense

const createExpense = asyncHandler(async (req, res) => {
  const { expenseCategory, subtripId } = req.body;

  if (expenseCategory === EXPENSE_CATEGORIES.SUBTRIP) {
    const subtrip = await Subtrip.findById(subtripId).populate("tripId");

    if (!subtrip) {
      res.status(404).json({ message: "Subtrip not found" });
      return;
    }

    const expense = new Expense({
      ...req.body,
      subtripId,
      tripId: subtrip?.tripId,
      vehicleId: subtrip?.tripId?.vehicleId,
    });

    const newExpense = await expense.save();

    subtrip.expenses.push(newExpense._id);


    await subtrip.save();

    // Record subtrip event for expense creation
    await recordSubtripEvent(
      subtrip._id,
      SUBTRIP_EVENT_TYPES.EXPENSE_ADDED,
      { expenseType: newExpense.expenseType, amount: newExpense.amount },
      req.user
    );

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
      _id,
      tripId,
      subtripId,
      vehicleId,
      pumpCd,
      expenseType,
      expenseCategory,
      fromDate,
      toDate,
      paidThrough,
    } = req.query;

    // Initialize query object
    const query = {};

    // Direct field filters with support for arrays
    if (_id) query._id = _id;

    // Trip filter - support for multiple trip IDs
    if (tripId) {
      const tripIds = Array.isArray(tripId) ? tripId : [tripId];
      query.tripId = { $in: tripIds };
    }

    // Subtrip filter - support for multiple subtrip IDs
    if (subtripId) {
      const subtripIds = Array.isArray(subtripId) ? subtripId : [subtripId];
      query.subtripId = { $in: subtripIds };
    }

    // Vehicle filter - support for multiple vehicle IDs
    if (vehicleId) {
      const vehicleIds = Array.isArray(vehicleId) ? vehicleId : [vehicleId];
      query.vehicleId = { $in: vehicleIds };
    }

    // Pump filter - support for multiple pump IDs
    if (pumpCd) {
      const pumpIds = Array.isArray(pumpCd) ? pumpCd : [pumpCd];
      query.pumpCd = { $in: pumpIds };
    }

    // Expense type filter - support for multiple expense types
    if (expenseType) {
      const expenseTypes = Array.isArray(expenseType)
        ? expenseType
        : [expenseType];
      query.expenseType = { $in: expenseTypes };
    }

    // Expense category filter - support for multiple categories
    if (expenseCategory) {
      const expenseCategories = Array.isArray(expenseCategory)
        ? expenseCategory
        : [expenseCategory];
      query.expenseCategory = { $in: expenseCategories };
    }

    // Date range filter
    if (fromDate || toDate) {
      query.date = {};

      if (fromDate) {
        query.date.$gte = new Date(fromDate);
      }

      if (toDate) {
        query.date.$lte = new Date(toDate);
      }
    }

    // Payment method filter - support for multiple payment methods
    if (paidThrough) {
      const paymentMethods = Array.isArray(paidThrough)
        ? paidThrough
        : [paidThrough];
      query.paidThrough = { $in: paymentMethods };
    }

    // Execute the query with population
    const expenses = await Expense.find(query)
      .populate("pumpCd")
      .populate({
        path: "vehicleId",
        populate: { path: "transporter", model: "Transporter" },
      })
      .populate({
        path: "tripId",
        populate: [{ path: "driverId", model: "Driver" }],
      })
      .populate("subtripId")
      .sort({ date: -1 });

    if (!expenses.length) {
      return res.status(404).json({
        message: "No expenses found matching the specified criteria.",
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

// Fetch Expenses with pagination and search
const fetchPaginatedExpenses = asyncHandler(async (req, res) => {
  try {
    const {
      vehicleNo,
      startDate,
      endDate,
      expenseType,
      expenseCategory,
      page = 1,
      rowsPerPage = 10,
    } = req.query;

    const limit = parseInt(rowsPerPage, 10) || 10;
    const skip = (parseInt(page, 10) - 1) * limit;

    const query = {};

    // Vehicle number search
    if (vehicleNo) {
      const vehicles = await Vehicle.find({
        vehicleNo: { $regex: vehicleNo, $options: "i" },
      }).select("_id");
      const vehicleIds = vehicles.map((v) => v._id);
      if (vehicleIds.length > 0) {
        query.vehicleId = { $in: vehicleIds };
      } else {
        // no vehicles match means no expenses will match
        return res.status(200).json({
          expenses: [],
          totalCount: 0,
          categoryCounts: {},
          startRange: 0,
          endRange: 0,
        });
      }
    }

    if (expenseType) {
      const types = Array.isArray(expenseType) ? expenseType : [expenseType];
      query.expenseType = { $in: types };
    }

    if (expenseCategory) {
      const categories = Array.isArray(expenseCategory)
        ? expenseCategory
        : [expenseCategory];
      query.expenseCategory = { $in: categories };
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const [totalCount, expenses, categoryAgg] = await Promise.all([
      Expense.countDocuments(query),
      Expense.find(query)
        .populate("pumpCd")
        .populate({
          path: "vehicleId",
          populate: { path: "transporter", model: "Transporter" },
        })
        .populate({
          path: "tripId",
          populate: [{ path: "driverId", model: "Driver" }],
        })
        .populate("subtripId")
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      Expense.aggregate([
        { $match: query },
        { $group: { _id: "$expenseCategory", count: { $sum: 1 } } },
      ]),
    ]);

    const categoryCounts = categoryAgg.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    res.status(200).json({
      expenses,
      totalCount,
      categoryCounts,
      startRange: skip + 1,
      endRange: skip + expenses.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching paginated expenses",
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

// fetch all expenses of a subtrip
const fetchSubtripExpenses = asyncHandler(async (req, res) => {
  const expenses = await Expense.find({ subtripId: req.params.id });
  res.status(200).json(expenses);
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
  const { id } = req.params;

  // Step 1: Check if expense exists
  const expense = await Expense.findById(id);
  if (!expense) {
    return res.status(404).json({ message: "Expense not found" });
  }

  // Step 2: If it's linked to a subtrip, remove reference
  if (expense.subtripId) {
    await Subtrip.findOneAndUpdate(
      { _id: expense.subtripId },
      { $pull: { expenses: expense._id } }
    );
    // Record subtrip event for expense deletion
    await recordSubtripEvent(
      expense.subtripId,
      SUBTRIP_EVENT_TYPES.EXPENSE_DELETED,
      { expenseType: expense.expenseType, amount: expense.amount },
      req.user
    );
  }

  // Step 3: Delete the expense
  await Expense.findByIdAndDelete(id);

  // Step 4: Respond
  res.status(200).json({ message: "Expense deleted successfully" });
});

module.exports = {
  createExpense,
  fetchExpenses,
  fetchPaginatedExpenses,
  fetchExpense,
  updateExpense,
  deleteExpense,
  fetchSubtripExpenses,
};
