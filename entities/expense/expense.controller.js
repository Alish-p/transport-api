import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import Expense from "./expense.model.js";
import Subtrip from "../subtrip/subtrip.model.js";
import Vehicle from "../vehicle/vehicle.model.js";
import Pump from "../pump/pump.model.js";
import { EXPENSE_CATEGORIES } from "./expense.constants.js";
import { addTenantToQuery } from "../../utils/tenant-utils.js";
import {
  recordSubtripEvent,
  SUBTRIP_EVENT_TYPES,
} from "../../helpers/subtrip-event-helper.js";

// Create Expense
const createExpense = asyncHandler(async (req, res) => {
  const { expenseCategory, subtripId } = req.body;

  if (expenseCategory === EXPENSE_CATEGORIES.SUBTRIP) {
    const subtrip = await Subtrip.findOne({
      _id: subtripId,
      tenant: req.tenant,
    });

    if (!subtrip) {
      res.status(404).json({ message: "Subtrip not found" });
      return;
    }

    const expense = new Expense({
      ...req.body,
      subtripId,
      tripId: subtrip?.tripId,
      vehicleId: subtrip?.vehicleId,
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
      pumpId,
      tripId,
      startDate,
      endDate,
      expenseType,
      expenseCategory,
      vehicleType,
    } = req.query;

    const { limit, skip } = req.pagination;

    const query = addTenantToQuery(req);

    if (tripId) query.tripId = tripId;
    if (subtripId) query.subtripId = subtripId;
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

    if (vehicleId || transporterId || vehicleType) {
      const vehicleQuery = {};
      if (vehicleId) vehicleQuery._id = vehicleId;
      if (transporterId) vehicleQuery.transporter = transporterId;
      if (vehicleType === "Market") vehicleQuery.isOwn = false;
      if (vehicleType === "Own") vehicleQuery.isOwn = true;

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
        .populate({ path: "pumpCd", select: "name" })
        .populate({ path: "subtripId", select: "subtripNo" })
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
      totals[t._id] = { count: t.count, amount: Math.round(t.amount * 100) / 100 };
      totals.all.count += t.count;
      totals.all.amount += t.amount;
    });

    totals.all.amount = Math.round(totals.all.amount * 100) / 100;

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

export {
  fetchExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  fetchPaginatedExpenses,
  exportExpenses,
};

// Export Expenses to Excel
const exportExpenses = asyncHandler(async (req, res) => {
  const {
    vehicleId,
    transporterId,
    subtripId,
    pumpId,
    tripId,
    startDate,
    endDate,
    expenseType,
    expenseCategory,
    vehicleType,
    columns, // Comma separated column IDs
  } = req.query;

  const query = addTenantToQuery(req);

  // Helper helper to cast to ObjectId safely
  async function toObjectId(id) {
    const { Types } = await import('mongoose');
    if (Types.ObjectId.isValid(id)) return new Types.ObjectId(id);
    return id;
  }

  if (tripId) query.tripId = await toObjectId(tripId);
  if (subtripId) query.subtripId = await toObjectId(subtripId);
  if (pumpId) query.pumpCd = await toObjectId(pumpId);
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

  // Column Mapping
  const COLUMN_MAPPING = {
    subtripId: { header: 'LR No', key: 'subtripId', width: 20 },
    vehicleNo: { header: 'Vehicle No', key: 'vehicleNo', width: 20 },
    expenseType: { header: 'Expense Type', key: 'expenseType', width: 20 },
    date: { header: 'Date', key: 'date', width: 20 },
    remarks: { header: 'Remarks', key: 'remark', width: 30 }, // Frontend 'remarks' -> Backend 'remark'
    dieselRate: { header: 'Diesel Rate (₹/Ltr)', key: 'dieselPrice', width: 15 }, // Frontend 'dieselRate' -> Backend 'dieselPrice'
    dieselLtr: { header: 'Diesel (Ltr)', key: 'dieselLtr', width: 15 },
    paidThrough: { header: 'Paid Through', key: 'paidThrough', width: 20 },
    expenseCategory: { header: 'Expense Category', key: 'expenseCategory', width: 20 },
    pumpCd: { header: 'Pump Code', key: 'pumpCode', width: 20 }, // Changed key to match pump.name alias if needed, or stick to map
    transporter: { header: 'Transporter', key: 'transporter', width: 20 },
    slipNo: { header: 'Slip No', key: 'slipNo', width: 20 },
    authorisedBy: { header: 'Authorised By', key: 'authorisedBy', width: 20 },
    amount: { header: 'Amount', key: 'amount', width: 15 },
    paymentMode: { header: 'Payment Mode', key: 'paymentMode', width: 15 }, // Extra backend field
    refNo: { header: 'Reference', key: 'refNo', width: 20 }, // Extra backend field
  };

  // Determine Columns
  let exportColumns = [];
  if (columns) {
    const columnIds = columns.split(',');
    exportColumns = columnIds
      .map((id) => COLUMN_MAPPING[id])
      .filter((col) => col); // Filter out undefined mappings
  }

  // Fallback to default columns if no valid columns provided
  if (exportColumns.length === 0) {
    exportColumns = [
      COLUMN_MAPPING.date,
      COLUMN_MAPPING.vehicleNo,
      COLUMN_MAPPING.expenseType,
      COLUMN_MAPPING.amount,
      COLUMN_MAPPING.paymentMode,
      COLUMN_MAPPING.refNo,
      COLUMN_MAPPING.remarks,
    ];
  }

  if (vehicleId || transporterId || vehicleType) {
    const vehicleQuery = {};
    if (vehicleId) vehicleQuery._id = await toObjectId(vehicleId);
    if (transporterId) vehicleQuery.transporter = await toObjectId(transporterId);
    if (vehicleType === "Market") vehicleQuery.isOwn = false;
    if (vehicleType === "Own") vehicleQuery.isOwn = true;

    const vehicles = await Vehicle.find(
      addTenantToQuery(req, vehicleQuery)
    ).select("_id");

    if (!vehicles.length) {
      // Return empty excel if no vehicles found to match
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
        stream: res,
        useStyles: true,
      });
      const worksheet = workbook.addWorksheet('Expenses');
      worksheet.columns = exportColumns;
      worksheet.commit();
      await workbook.commit();
      return;
    }

    query.vehicleId = { $in: vehicles.map((v) => v._id) };
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=Expenses.xlsx"
  );

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
  });

  const worksheet = workbook.addWorksheet('Expenses');
  worksheet.columns = exportColumns;

  // AGGREGATION PIPELINE
  const pipeline = [
    { $match: query },
    { $sort: { date: -1 } },
    // Lookup Vehicle
    {
      $lookup: {
        from: 'vehicles',
        localField: 'vehicleId',
        foreignField: '_id',
        as: 'vehicle',
      },
    },
    { $unwind: { path: '$vehicle', preserveNullAndEmptyArrays: true } },
    // Lookup Transporter
    {
      $lookup: {
        from: 'transporters',
        localField: 'vehicle.transporter',
        foreignField: '_id',
        as: 'transporter',
      },
    },
    { $unwind: { path: '$transporter', preserveNullAndEmptyArrays: true } },
    // Lookup Pump
    {
      $lookup: {
        from: 'pumps',
        localField: 'pumpCd', // Assuming 'pumpCd' in Expense stores ObjectId of Pump
        foreignField: '_id',
        as: 'pump',
      },
    },
    { $unwind: { path: '$pump', preserveNullAndEmptyArrays: true } },
    // Lookup Subtrip
    {
      $lookup: {
        from: 'subtrips',
        localField: 'subtripId',
        foreignField: '_id',
        as: 'subtrip',
      },
    },
    { $unwind: { path: '$subtrip', preserveNullAndEmptyArrays: true } },
    // Project fields needed for Export
    {
      $project: {
        date: 1,
        expenseType: 1,
        amount: 1,
        dieselLtr: 1,
        dieselPrice: 1,
        remarks: 1,
        paidThrough: 1,
        expenseCategory: 1,
        slipNo: 1,
        authorisedBy: 1,
        paymentMode: 1,
        refNo: 1,
        // Joined fields
        vehicleNo: '$vehicle.vehicleNo',
        transporter: '$transporter.transportName',
        pumpCode: '$pump.name',
        subtripId: '$subtrip.subtripNo',
      },
    },
  ];

  const cursor = Expense.aggregate(pipeline).cursor();

  let totalAmount = 0;
  let totalDieselLtr = 0;

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const row = {};

    exportColumns.forEach((col) => {
      const key = col.key;

      // Handle Date 
      if (key === 'date') row[key] = doc.date ? new Date(doc.date).toISOString().split('T')[0] : '';

      // Handle Numeric / Sums
      else if (key === 'amount') {
        const val = typeof doc.amount === 'number' ? Math.round(doc.amount * 100) / 100 : 0;
        row[key] = val || '-';
        totalAmount += val;
      }
      else if (key === 'dieselLtr') {
        const val = typeof doc.dieselLtr === 'number' ? Math.round(doc.dieselLtr * 100) / 100 : 0;
        row[key] = val || '-';
        totalDieselLtr += val;
      }
      else if (key === 'dieselPrice') {
        row[key] = typeof doc.dieselPrice === 'number' ? Math.round(doc.dieselPrice * 100) / 100 : '-';
      }

      // Handle Fields
      else if (key === 'remark') row[key] = doc.remarks || '-';
      else if (key === 'pumpCd') row[key] = doc.pumpCode || '-'; // Mapped pipeline project to pumpCode

      // Handle Lookups
      else row[key] = doc[key] || '-';
    });

    // Fix remark fallback if needed
    if (row.remark === '-' && doc.remarks) {
      row.remark = doc.remarks;
    }

    worksheet.addRow(row).commit();
  }

  // Add Totals Row
  const totalRow = {};
  exportColumns.forEach((col) => {
    if (col.key === 'date') totalRow[col.key] = 'TOTAL';
    else if (col.key === 'amount') totalRow[col.key] = Math.round(totalAmount * 100) / 100;
    else if (col.key === 'dieselLtr') totalRow[col.key] = Math.round(totalDieselLtr * 100) / 100;
    else totalRow[col.key] = '';
  });

  const footerRow = worksheet.addRow(totalRow);
  footerRow.font = { bold: true };
  footerRow.commit();

  worksheet.commit();
  await workbook.commit();
});
