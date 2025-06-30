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

// Fetch Expenses with pagination and search
const fetchPaginatedExpenses = asyncHandler(async (req, res) => {
  try {
    const {
      vehicleNo,
      startDate,
      endDate,
      expenseType,
      expenseCategory,
    } = req.query;

    const { limit, skip } = req.pagination;

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
          totals: {
            all: { count: 0, amount: 0 },
            vehicle: { count: 0, amount: 0 },
            subtrip: { count: 0, amount: 0 },
          },
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

    const [expenses, totalsAgg] = await Promise.all([
      Expense.find(query)
        .select(
          "vehicleId subtripId date expenseType amount slipNo pumpCd remarks dieselLtr dieselPrice paidThrough authorisedBy"
        )
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
        { $match: query },
        {
          $group: {
            _id: "$expenseCategory",
            count: { $sum: 1 },
            amount: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const formattedExpenses = expenses.map((exp) => ({
      vehicleNo: exp.vehicleId?.vehicleNo,
      transportName: exp.vehicleId?.transporter?.transportName,
      subtripId: exp.subtripId,
      date: exp.date,
      expenseType: exp.expenseType,
      amount: exp.amount,
      slipNo: exp.slipNo,
      pumpCd: exp.pumpCd?.pumpName,
      remarks: exp.remarks,
      dieselLtr: exp.dieselLtr,
      dieselPrice: exp.dieselPrice,
      paidThrough: exp.paidThrough,
      authorisedBy: exp.authorisedBy,
    }));

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
      expenses: formattedExpenses,
      totals,
      startRange: skip + 1,
      endRange: skip + formattedExpenses.length,
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
  fetchPaginatedExpenses,
  fetchExpense,
  updateExpense,
  deleteExpense,
};
