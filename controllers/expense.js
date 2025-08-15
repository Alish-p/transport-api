const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Expense = require("../model/Expense");
const Subtrip = require("../model/Subtrip");
const Vehicle = require("../model/Vehicle");
const { EXPENSE_CATEGORIES } = require("../constants/status");
const { addTenantToQuery } = require("../utills/tenant-utils");
const {
  recordSubtripEvent,
  SUBTRIP_EVENT_TYPES,
} = require("../helpers/subtrip-event-helper");

// Create Expense
const createExpense = asyncHandler(async (req, res) => {
  const { expenseCategory, subtripId } = req.body;

  if (expenseCategory === EXPENSE_CATEGORIES.SUBTRIP) {
    const subtrip = await Subtrip.findOne({
      _id: subtripId,
      tenant: req.tenant,
    }).populate("tripId");

    if (!subtrip) {
      res.status(404).json({ message: "Subtrip not found" });
      return;
    }

    const expense = new Expense({
      ...req.body,
      subtripId,
      tripId: subtrip?.tripId,
      vehicleId: subtrip?.tripId?.vehicleId,
      tenant: req.tenant,
    });

    const newExpense = await expense.save();

    subtrip.expenses.push(newExpense._id);

    await subtrip.save();

    // Record subtrip event for expense creation
    await recordSubtripEvent(
      subtrip._id,
      SUBTRIP_EVENT_TYPES.EXPENSE_ADDED,
      { expenseType: newExpense.expenseType, amount: newExpense.amount },
      req.user,
      req.tenant
    );

    res.status(201).json(newExpense);
  } else {
    // If expenseCategory is not "subtrip", create an expense without associating it with a subtrip
    const expense = new Expense({
      ...req.body,
      tenant: req.tenant,
    });
    const newExpense = await expense.save();

    res.status(201).json(newExpense);
  }
});

// Fetch Expenses with pagination and search
const fetchPaginatedExpenses = asyncHandler(async (req, res) => {
  try {
    const {
      vehicleId,
      transporterId,
      subtripId,
      routeId,
      pumpId,
      tripId,
      startDate,
      endDate,
      expenseType,
      expenseCategory,
    } = req.query;

    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (tripId) query.tripId = tripId;
    let subtripIdsFromRoute = [];
    if (routeId) {
      const subtripFilter = addTenantToQuery(req, { routeCd: routeId });
      if (subtripId) subtripFilter._id = subtripId;
      const subtrips = await Subtrip.find(subtripFilter).select("_id");
      if (!subtrips.length) {
        return res.status(200).json({
          expenses: [],
          totals: {
            all: { count: 0, amount: 0 },
            vehicle: { count: 0, amount: 0 },
            subtrip: { count: 0, amount: 0 },
          },
          startRange: 0,
          endRange: 0,
        });
      }
      subtripIdsFromRoute = subtrips.map((st) => st._id);
    }

    if (subtripId && !routeId) {
      query.subtripId = subtripId;
    } else if (subtripIdsFromRoute.length) {
      query.subtripId = { $in: subtripIdsFromRoute };
    }
    if (pumpId) query.pumpCd = new mongoose.Types.ObjectId(pumpId);
    if (expenseType) {
      const expenseTypeArray = Array.isArray(expenseType)
        ? expenseType
        : [expenseType];
      query.expenseType = { $in: expenseTypeArray };
    }
    if (expenseCategory) query.expenseCategory = expenseCategory;

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (vehicleId || transporterId) {
      const vehicleQuery = {};
      if (vehicleId) vehicleQuery._id = vehicleId;
      if (transporterId) vehicleQuery.transporter = transporterId;

      const vehicles = await Vehicle.find(
        addTenantToQuery(req, vehicleQuery)
      ).select("_id");

      if (!vehicles.length) {
        return res.status(200).json({
          expenses: [],
          totals: {
            all: { count: 0, amount: 0 },
            vehicle: { count: 0, amount: 0 },
            subtrip: { count: 0, amount: 0 },
          },
          startRange: 0,
          endRange: 0,
        });
      }

      query.vehicleId = { $in: vehicles.map((v) => v._id) };
    }

    // Mongoose does not automatically cast aggregation pipeline values, so make
    // sure tenant is an ObjectId when used in $match
    const aggQuery = { ...query };

    const [expenses, totalsAgg] = await Promise.all([
      Expense.find(query)
        .populate({
          path: "vehicleId",
          select: "vehicleNo transporter",
          populate: { path: "transporter", select: "transportName" },
        })
        .populate({ path: "pumpCd", select: "pumpName" })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      Expense.aggregate([
        { $match: aggQuery },
        {
          $group: {
            _id: "$expenseCategory",
            count: { $sum: 1 },
            amount: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const totals = {
      all: { count: 0, amount: 0 },
      vehicle: { count: 0, amount: 0 },
      subtrip: { count: 0, amount: 0 },
    };

    totalsAgg.forEach((t) => {
      totals[t._id] = { count: t.count, amount: t.amount };
      totals.all.count += t.count;
      totals.all.amount += t.amount;
    });

    res.status(200).json({
      expenses,
      totals,
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
  const expense = await Expense.findOne({
    _id: req.params.id,
    tenant: req.tenant,
  })
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
  const expense = await Expense.findOneAndUpdate(
    { _id: req.params.id, tenant: req.tenant },
    req.body,
    { new: true }
  );
  res.status(200).json(expense);
});

// Delete Expense
const deleteExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Step 1: Check if expense exists
  const expense = await Expense.findOne({ _id: id, tenant: req.tenant });
  if (!expense) {
    return res.status(404).json({ message: "Expense not found" });
  }

  // Step 2: If it's linked to a subtrip, remove reference
  if (expense.subtripId) {
    await Subtrip.findOneAndUpdate(
      { _id: expense.subtripId, tenant: req.tenant },
      { $pull: { expenses: expense._id } }
    );
    // Record subtrip event for expense deletion
    await recordSubtripEvent(
      expense.subtripId,
      SUBTRIP_EVENT_TYPES.EXPENSE_DELETED,
      { expenseType: expense.expenseType, amount: expense.amount },
      req.user,
      req.tenant
    );
  }

  // Step 3: Delete the expense
  await Expense.findOneAndDelete({ _id: id, tenant: req.tenant });

  // Step 4: Respond
  res.status(200).json({ message: "Expense deleted successfully" });
});

module.exports = {
  createExpense,
  fetchPaginatedExpenses,
  fetchExpense,
  updateExpense,
  deleteExpense,
};
