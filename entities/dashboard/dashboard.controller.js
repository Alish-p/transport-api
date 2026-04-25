import asyncHandler from 'express-async-handler';
import dayjs from 'dayjs';
import mongoose from 'mongoose';
import Loan from '../loan/loan.model.js';
import Driver from '../driver/driver.model.js';
import Vehicle from '../vehicle/vehicle.model.js';
import Invoice from '../invoice/invoice.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Expense from '../expense/expense.model.js';
import TransporterAdvance from '../transporterAdvance/transporterAdvance.model.js';
import Customer from '../customer/customer.model.js';
import Transporter from '../transporter/transporter.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import DriverSalary from '../driverSalary/driverSalary.model.js';
import { INVOICE_STATUS } from '../invoice/invoice.constants.js';
import { SUBTRIP_STATUS } from '../subtrip/subtrip.constants.js';
import { EXPENSE_CATEGORIES } from '../expense/expense.constants.js';
import TransporterPayment from '../transporterPayment/transporterPayment.model.js';
import { calculateTransporterPayment } from '../transporterPayment/transporterPayment.utils.js';
import VehicleDocument from '../vehicleDocument/vehicleDocument.model.js';
import { REQUIRED_DOC_TYPES } from '../vehicleDocument/vehicleDocument.constants.js';
import SubtripEvent from '../subtripEvent/subtripEvent.model.js';
import { DEFAULT_TIMEZONE, getStartOfMonthIST, getNextMonthStartIST, getStartOfYearIST, getNextYearStartIST } from '../../utils/time-utils.js';
import Tyre from '../tyre/tyre.model.js';
import { TYRE_STATUS, TYRE_TYPE, TYRE_HISTORY_ACTION } from '../tyre/tyre.constants.js';
import TyreHistory from '../tyre/tyre-history.model.js';
import Part from '../maintenanceAndInventory/part/part.model.js';
import PartStock from '../maintenanceAndInventory/partStock/partStock.model.js';
import PartLocation from '../maintenanceAndInventory/partLocation/partLocation.model.js';
import PartTransaction from '../maintenanceAndInventory/partTransaction/partTransaction.model.js';
import { INVENTORY_ACTIVITY_TYPES } from '../maintenanceAndInventory/partTransaction/partTransaction.constants.js';
import Vendor from '../maintenanceAndInventory/vendor/vendor.model.js';
import WorkOrder from '../maintenanceAndInventory/workOrder/workOrder.model.js';
import { WORK_ORDER_STATUS } from '../maintenanceAndInventory/workOrder/workOrder.constants.js';
import PurchaseOrder from '../maintenanceAndInventory/purchaseOrder/purchaseOrder.model.js';
import { PURCHASE_ORDER_STATUS } from '../maintenanceAndInventory/purchaseOrder/purchaseOrder.constants.js';

// Get basic entity counts
const getTotalCounts = asyncHandler(async (req, res) => {
  const [
    vehicleCount,
    driverCount,
    transporterCount,
    customerCount,
    invoiceCount,
    subtripCount,
  ] = await Promise.all([
    Vehicle.countDocuments(addTenantToQuery(req)),
    Driver.countDocuments(addTenantToQuery(req)),
    Transporter.countDocuments(addTenantToQuery(req)),
    Customer.countDocuments(addTenantToQuery(req)),
    Invoice.countDocuments(addTenantToQuery(req)),
    Subtrip.countDocuments(addTenantToQuery(req)),
  ]);


  res.status(200).json({
    vehicles: vehicleCount,
    drivers: driverCount,
    transporters: transporterCount,
    customers: customerCount,
    invoices: invoiceCount,
    subtrips: subtripCount,
  });
});

// Get customer-wise total weight and freight for a month
const getCustomerMonthlyFreight = asyncHandler(async (req, res) => {
  const { month } = req.query;

  if (!month) {
    return res
      .status(400)
      .json({ message: "Month query parameter required in YYYY-MM format" });
  }

  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(monthNum) ||
    monthNum < 1 ||
    monthNum > 12
  ) {
    return res
      .status(400)
      .json({ message: "Invalid month format. Use YYYY-MM" });
  }

  const startDate = getStartOfMonthIST(year, monthNum);
  const endDate = getNextMonthStartIST(year, monthNum);

  try {
    const tenantMatch = { tenant: req.tenant };
    const results = await Subtrip.aggregate([
      {
        $match: {
          ...tenantMatch,
          customerId: { $ne: null },
          startDate: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: "$customerId",
          totalLoadingWeight: { $sum: { $ifNull: ["$loadingWeight", 0] } },
          totalFreightAmount: {
            $sum: {
              $multiply: [
                { $ifNull: ["$loadingWeight", 0] },
                { $ifNull: ["$rate", 0] },
              ],
            },
          },
          inQueue: {
            $sum: {
              $cond: [
                { $eq: ["$subtripStatus", SUBTRIP_STATUS.IN_QUEUE] },
                1,
                0,
              ],
            },
          },
          loaded: {
            $sum: {
              $cond: [{ $eq: ["$subtripStatus", SUBTRIP_STATUS.LOADED] }, 1, 0],
            },
          },
          error: {
            $sum: {
              $cond: [{ $eq: ["$subtripStatus", SUBTRIP_STATUS.ERROR] }, 1, 0],
            },
          },
          received: {
            $sum: {
              $cond: [
                { $eq: ["$subtripStatus", SUBTRIP_STATUS.RECEIVED] },
                1,
                0,
              ],
            },
          },
          billed: {
            $sum: {
              $cond: [{ $eq: ["$subtripStatus", SUBTRIP_STATUS.BILLED] }, 1, 0],
            },
          },
        },
      },
      {
        $match: {
          $or: [
            { totalLoadingWeight: { $gt: 0 } },
            { totalFreightAmount: { $gt: 0 } },
          ],
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "_id",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      {
        $project: {
          _id: 0,
          customerId: "$_id",
          customerName: "$customer.customerName",
          totalLoadingWeight: 1,
          totalFreightAmount: 1,
          subtripCounts: {
            inQueue: "$inQueue",
            loaded: "$loaded",
            error: "$error",
            received: "$received",
            billed: "$billed",
          },
        },
      },
      {
        $sort: {
          totalLoadingWeight: -1,
          totalFreightAmount: -1,
        },
      },
    ]);

    res.status(200).json(results);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
});

// Get subtrips whose eway bill is expiring in the next 24 hours
const getExpiringSubtrips = asyncHandler(async (req, res) => {
  const now = new Date();
  // Fixed 24-hour window from current time
  const threshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const subtrips = await Subtrip.find(
    addTenantToQuery(req, {
      subtripStatus: SUBTRIP_STATUS.LOADED,
      // Only include eway bills expiring in the next 24 hours; exclude already expired
      ewayExpiryDate: { $ne: null, $gt: now, $lte: threshold },
    })
  )
    .select("_id subtripNo startDate unloadingPoint ewayExpiryDate vehicleId customerId")
    .populate({ path: "vehicleId", select: "vehicleNo" })
    .populate({ path: "customerId", select: "customerName" })
    .sort({ ewayExpiryDate: 1 })
    .lean();

  const formatted = subtrips.map((st) => ({
    subtripId: st._id,
    subtripNo: st.subtripNo,
    vehicle: st.vehicleId?.vehicleNo || null,
    customer: st.customerId?.customerName || null,
    startDate: st.startDate,
    unloadingPoint: st.unloadingPoint,
    expired: st.ewayExpiryDate < now,
    ewayExpiryDate: st.ewayExpiryDate,
  }));

  res.status(200).json(formatted);
});

const getSubtripMonthlyData = asyncHandler(async (req, res) => {
  const yearParam = parseInt(req.query.year, 10);
  const year = Number.isNaN(yearParam)
    ? new Date().getUTCFullYear()
    : yearParam;

  const startOfYear = getStartOfYearIST(year);
  const endOfYear = getNextYearStartIST(year);

  try {
    const [results, vehicleExpenses] = await Promise.all([
      Subtrip.aggregate([
      {
        $match: {
          tenant: req.tenant,
          startDate: { $gte: startOfYear, $lt: endOfYear },
          isEmpty: false,
        },
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicleId",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      { $unwind: "$vehicle" },
      {
        $lookup: {
          from: "expenses",
          let: { subtripId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$subtripId", "$$subtripId"] },
                    { $eq: ["$tenant", req.tenant] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalExpenses: { $sum: { $ifNull: ["$amount", 0] } },
              },
            },
          ],
          as: "expenseSummary",
        },
      },
      {
        $addFields: {
          month: { $month: { date: "$startDate", timezone: DEFAULT_TIMEZONE } },
          expenseAmount: {
            $ifNull: [{ $arrayElemAt: ["$expenseSummary.totalExpenses", 0] }, 0],
          },
          freightAmount: {
            $multiply: [
              { $ifNull: ["$loadingWeight", 0] },
              { $ifNull: ["$rate", 0] },
            ],
          },
          commissionAmount: {
            $multiply: [
              { $ifNull: ["$loadingWeight", 0] },
              { $ifNull: ["$commissionRate", 0] },
            ],
          },
        },
      },
      {
        $group: {
          _id: { month: "$month", isOwn: "$vehicle.isOwn" },
          count: { $sum: 1 },
          totalIncome: {
            $sum: {
              $cond: ["$vehicle.isOwn", "$freightAmount", 0],
            },
          },
          totalExpenses: {
            $sum: {
              $cond: ["$vehicle.isOwn", "$expenseAmount", 0],
            },
          },
          totalCommission: {
            $sum: {
              $cond: ["$vehicle.isOwn", 0, "$commissionAmount"],
            },
          },
        },
      },
      ]), // End Subtrip.aggregate
      Expense.aggregate([
        {
          $match: {
            tenant: req.tenant,
            expenseCategory: "vehicle",
            date: { $gte: startOfYear, $lt: endOfYear },
          },
        },
        {
          $lookup: {
            from: "vehicles",
            localField: "vehicleId",
            foreignField: "_id",
            as: "vehicle",
          },
        },
        { $unwind: { path: "$vehicle", preserveNullAndEmptyArrays: true } },
        {
          $match: {
            $or: [
              { "vehicle.isOwn": true },
              { vehicleId: { $exists: false } },
              { vehicleId: null },
            ],
          },
        },
        {
          $group: {
            _id: { month: { $month: { date: "$date", timezone: DEFAULT_TIMEZONE } } },
            amount: { $sum: { $ifNull: ["$amount", 0] } },
          },
        },
      ]), // End Expense.aggregate
    ]);

    const own = Array(12).fill(0);
    const market = Array(12).fill(0);
    const monthlyMetrics = {
      own: Array.from({ length: 12 }, () => ({
        totalSubtrips: 0,
        totalIncome: 0,
        subtripExpense: 0,
        vehicleExpense: 0,
        profit: 0,
      })),
      market: Array.from({ length: 12 }, () => ({
        totalSubtrips: 0,
        totalCommission: 0,
      })),
    };

    results.forEach((r) => {
      const monthIndex = r._id.month - 1; // $month is 1-indexed
      if (r._id.isOwn) {
        own[monthIndex] = r.count;
        monthlyMetrics.own[monthIndex].totalSubtrips = r.count;
        monthlyMetrics.own[monthIndex].totalIncome = Math.round((r.totalIncome || 0) * 100) / 100;
        monthlyMetrics.own[monthIndex].subtripExpense = Math.round((r.totalExpenses || 0) * 100) / 100;
      } else {
        market[monthIndex] = r.count;
        monthlyMetrics.market[monthIndex] = {
          totalSubtrips: r.count,
          totalCommission: Math.round((r.totalCommission || 0) * 100) / 100,
        };
      }
    });

    vehicleExpenses.forEach((v) => {
      const monthIndex = v._id.month - 1;
      monthlyMetrics.own[monthIndex].vehicleExpense = Math.round((v.amount || 0) * 100) / 100;
    });

    // Calculate profit
    monthlyMetrics.own.forEach((m) => {
      m.profit = Math.round((m.totalIncome - m.subtripExpense - m.vehicleExpense) * 100) / 100;
    });

    res.status(200).json({ year, own, market, monthlyMetrics });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
});

// Get monthly expense summary grouped by expenseType for subtrip expenses
const getMonthlySubtripExpenseSummary = asyncHandler(async (req, res) => {
  const { month } = req.query;

  if (!month) {
    return res
      .status(400)
      .json({ message: "Month query parameter required in YYYY-MM format" });
  }

  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(monthNum) ||
    monthNum < 1 ||
    monthNum > 12
  ) {
    return res
      .status(400)
      .json({ message: "Invalid month format. Use YYYY-MM" });
  }

  const startDate = getStartOfMonthIST(year, monthNum);
  const endDate = getNextMonthStartIST(year, monthNum);

  try {
    const results = await Expense.aggregate([
      {
        $match: {
          tenant: req.tenant,
          expenseCategory: EXPENSE_CATEGORIES.SUBTRIP,
          date: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: "$expenseType",
          totalAmount: { $sum: { $ifNull: ["$amount", 0] } },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          expenseType: "$_id",
          totalAmount: 1,
          count: 1,
        },
      },
      { $sort: { expenseType: 1 } },
    ]);

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching expense summary",
      error: error.message,
    });
  }
});

// Get monthly shipped tonnage grouped by material type
const getMonthlyMaterialWeightSummary = asyncHandler(async (req, res) => {
  const { month } = req.query;

  if (!month) {
    return res
      .status(400)
      .json({ message: "Month query parameter required in YYYY-MM format" });
  }

  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(monthNum) ||
    monthNum < 1 ||
    monthNum > 12
  ) {
    return res
      .status(400)
      .json({ message: "Invalid month format. Use YYYY-MM" });
  }

  const startDate = getStartOfMonthIST(year, monthNum);
  const endDate = getNextMonthStartIST(year, monthNum);

  try {
    const results = await Subtrip.aggregate([
      {
        $match: {
          tenant: req.tenant,
          materialType: { $ne: null },
          startDate: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: "$materialType",
          totalLoadingWeight: { $sum: { $ifNull: ["$loadingWeight", 0] } },
        },
      },
      {
        $match: { totalLoadingWeight: { $gt: 0 } },
      },
      {
        $project: {
          _id: 0,
          materialType: "$_id",
          totalLoadingWeight: 1,
        },
      },
      { $sort: { totalLoadingWeight: -1 } },
    ]);

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching material summary",
      error: error.message,
    });
  }
});

// Get monthly destination summary grouped by loading point (destination)
const getMonthlyDestinationSubtrips = asyncHandler(async (req, res) => {
  const { month } = req.query;

  if (!month) {
    return res
      .status(400)
      .json({ message: "Month query parameter required in YYYY-MM format" });
  }

  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(monthNum) ||
    monthNum < 1 ||
    monthNum > 12
  ) {
    return res
      .status(400)
      .json({ message: "Invalid month format. Use YYYY-MM" });
  }

  const startDate = getStartOfMonthIST(year, monthNum);
  const endDate = getNextMonthStartIST(year, monthNum);

  try {
    const results = await Subtrip.aggregate([
      {
        $match: {
          tenant: req.tenant,
          unloadingPoint: { $ne: null },
          startDate: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: { $toUpper: "$unloadingPoint" },
          totalLoadingWeight: { $sum: { $ifNull: ["$loadingWeight", 0] } },
          received: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$subtripStatus",
                    [SUBTRIP_STATUS.RECEIVED, SUBTRIP_STATUS.BILLED],
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $match: { received: { $gt: 0 } },
      },
      {
        $project: {
          _id: 0,
          destination: "$_id",
          totalLoadingWeight: 1,
          received: 1,
        },
      },
      { $sort: { received: -1 } },
    ]);

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching destination summary",
      error: error.message,
    });
  }
});

// Get number of subtrips grouped by status for loaded and empty trips
const getSubtripStatusSummary = asyncHandler(async (req, res) => {
  try {
    const loadedStatuses = Object.values(SUBTRIP_STATUS);
    const emptyStatuses = [SUBTRIP_STATUS.IN_QUEUE, SUBTRIP_STATUS.BILLED];

    const [loadedAgg, emptyAgg] = await Promise.all([
      Subtrip.aggregate([
        { $match: { tenant: req.tenant, isEmpty: false } },
        { $group: { _id: "$subtripStatus", count: { $sum: 1 } } },
      ]),
      Subtrip.aggregate([
        {
          $match: {
            tenant: req.tenant,
            isEmpty: true,
            subtripStatus: { $in: emptyStatuses },
          },
        },
        { $group: { _id: "$subtripStatus", count: { $sum: 1 } } },
      ]),
    ]);

    const initMap = (statuses) =>
      statuses.reduce((acc, st) => {
        acc[st] = 0;
        return acc;
      }, {});

    const loaded = initMap(loadedStatuses);
    const empty = initMap(emptyStatuses);

    loadedAgg.forEach((r) => {
      loaded[r._id] = r.count;
    });

    emptyAgg.forEach((r) => {
      empty[r._id] = r.count;
    });

    res.status(200).json({ loaded, empty });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
});

// Vehicle document status summary (own vehicles only)
// Returns counts for: missing (required doc slots lacking), expiring (within N days), expired, valid
// Query: optional `days` (default 30) for expiring window
const getVehicleDocumentStatusSummary = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) > 0 ? Number(req.query.days) : 15;
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // 1) Fetch own vehicles for this tenant
  const ownVehicles = await Vehicle.find({ tenant: req.tenant, isOwn: true })
    .select('_id')
    .lean();

  if (!ownVehicles.length) {
    return res.status(200).json({
      missing: 0,
      expiring: 0,
      expired: 0,
      valid: 0,
      meta: {
        vehicles: 0,
        requiredDocSlots: 0,
        windowDays: days,
      },
    });
  }

  const vehicleIds = ownVehicles.map((v) => v._id);

  // 2) Fetch active required documents for these vehicles
  const docs = await VehicleDocument.find({
    tenant: req.tenant,
    isActive: true,
    vehicle: { $in: vehicleIds },
    docType: { $in: REQUIRED_DOC_TYPES },
  })
    .select('vehicle docType expiryDate')
    .lean();

  // 3) Build present doc types per vehicle for missing calculation
  const presentByVehicle = new Map(); // vehicleId -> Set(docType)
  for (const d of docs) {
    const key = String(d.vehicle);
    if (!presentByVehicle.has(key)) presentByVehicle.set(key, new Set());
    presentByVehicle.get(key).add(d.docType);
  }

  // Total required slots across own vehicles
  const totalRequiredSlots = ownVehicles.length * REQUIRED_DOC_TYPES.length;

  // 4) Compute missing required doc slots
  let missing = 0;
  for (const v of ownVehicles) {
    const key = String(v._id);
    const present = presentByVehicle.get(key) || new Set();
    for (const t of REQUIRED_DOC_TYPES) {
      if (!present.has(t)) missing += 1;
    }
  }

  // 5) Classify current docs into expired / expiring / valid
  let expired = 0;
  let expiring = 0;
  let valid = 0;

  for (const d of docs) {
    const exp = d.expiryDate ? new Date(d.expiryDate) : null;
    if (!exp) {
      // No expiry considered valid
      valid += 1;
      continue;
    }
    if (exp < now) {
      expired += 1;
    } else if (exp <= end) {
      expiring += 1;
    } else {
      valid += 1;
    }
  }

  return res.status(200).json({
    missing,
    expiring,
    expired,
    valid,
    meta: {
      vehicles: ownVehicles.length,
      requiredDocSlots: totalRequiredSlots,
      activeDocsConsidered: docs.length,
      windowDays: days,
    },
  });
});

// Fetch all expiring/expired vehicle documents (non-paginated)
const getExpiringDocuments = asyncHandler(async (req, res) => {
  const days = 10;
  const now = new Date();
  const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // Use addTenantToQuery to ensure we only get docs for current tenant
  const query = addTenantToQuery(req, {
    isActive: true,
    expiryDate: { $ne: null, $lte: threshold },
  });

  const [docs, totalsDocs] = await Promise.all([
    VehicleDocument.find(query)
      .populate({ path: 'vehicle', select: 'vehicleNo' })
      .populate({ path: 'createdBy', select: 'name' })
      .sort({ expiryDate: 1 })
      .lean(),
    // We still want the full totals (expired/expiring/valid/missing) similar to fetchDocumentsList if possible
    // but the user only asked for the list of expired/expiring.
    // However, to keep it "similar" to fetchDocumentsList, let's include counts.
    VehicleDocument.find(addTenantToQuery(req, { isActive: true }))
      .select('expiryDate')
      .lean()
  ]);

  // Compute counts for the response
  let totalExpired = 0;
  let totalExpiring = 0;
  let totalValid = 0;

  totalsDocs.forEach(d => {
    const exp = d.expiryDate ? new Date(d.expiryDate) : null;
    if (!exp) {
      totalValid++;
    } else if (exp < now) {
      totalExpired++;
    } else if (exp <= threshold) {
      totalExpiring++;
    } else {
      totalValid++;
    }
  });

  // Since we don't have vehicle skip/limit here (it's non-paginated), we can't easily compute "missing"
  // without fetching all vehicles. Let's see if we should include missing. 
  // fetchDocumentsList includes it. If we want it "similar", we should include it.

  const results = docs.map((d) => {
    const exp = d.expiryDate ? new Date(d.expiryDate) : null;
    let st = 'valid';
    if (exp) {
      if (exp < now) st = 'expired';
      else st = 'expiring';
    }
    return {
      ...d,
      status: st,
      vehicleNo: d.vehicle?.vehicleNo,
      createdByName: d.createdBy?.name,
    };
  });

  res.status(200).json({
    results,
    total: results.length,
    totalExpiring: totalExpiring,
    totalExpired: totalExpired,
    totalValid: totalValid,
    // Add missing if needed, but maybe not required for "all data" list of alerts.
    // I'll skip missing for now as it's expensive to compute and might not be needed for this specific alert list.
  });
});


// Get invoice status counts
const getInvoiceStatusSummary = asyncHandler(async (req, res) => {
  try {
    const statusAgg = await Invoice.aggregate([
      { $match: { tenant: req.tenant } },
      { $group: { _id: "$invoiceStatus", count: { $sum: 1 } } },
    ]);

    const statusMap = Object.values(INVOICE_STATUS).reduce((acc, st) => {
      acc[st] = 0;
      return acc;
    }, {});

    statusAgg.forEach((r) => {
      statusMap[r._id] = r.count;
    });

    const series = [
      { label: "Pending", value: statusMap[INVOICE_STATUS.PENDING] },
      { label: "Received", value: statusMap[INVOICE_STATUS.RECEIVED] },
      {
        label: "Partial Received",
        value: statusMap[INVOICE_STATUS.PARTIAL_RECEIVED],
      },
      { label: "OverDue", value: statusMap[INVOICE_STATUS.OVERDUE] },
    ];

    res.status(200).json({ series });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
});


const getFinancialMonthlyData = asyncHandler(async (req, res) => {
  const yearParam = parseInt(req.query.year, 10);
  const year = Number.isNaN(yearParam)
    ? new Date().getUTCFullYear()
    : yearParam;

  const startOfYear = getStartOfYearIST(year);
  const endOfYear = getNextYearStartIST(year);

  try {
    const [invoiceAgg, transporterAgg, driverAgg, loanAgg] = await Promise.all([
      Invoice.aggregate([
        {
          $match: {
            tenant: req.tenant,
            issueDate: { $gte: startOfYear, $lt: endOfYear },
          },
        },
        {
          $group: {
            _id: { month: { $month: { date: "$issueDate", timezone: DEFAULT_TIMEZONE } } },
            amount: { $sum: { $ifNull: ["$netTotal", 0] } },
          },
        },
      ]),
      TransporterPayment.aggregate([
        {
          $match: {
            tenant: req.tenant,
            issueDate: { $gte: startOfYear, $lt: endOfYear },
          },
        },
        {
          $group: {
            _id: { month: { $month: { date: "$issueDate", timezone: DEFAULT_TIMEZONE } } },
            amount: { $sum: { $ifNull: ["$summary.netIncome", 0] } },
          },
        },
      ]),
      DriverSalary.aggregate([
        {
          $match: {
            tenant: req.tenant,
            issueDate: { $gte: startOfYear, $lt: endOfYear },
          },
        },
        {
          $group: {
            _id: { month: { $month: { date: "$issueDate", timezone: DEFAULT_TIMEZONE } } },
            amount: { $sum: { $ifNull: ["$summary.netIncome", 0] } },
          },
        },
      ]),
      Loan.aggregate([
        {
          $match: {
            tenant: req.tenant,
            disbursementDate: { $gte: startOfYear, $lt: endOfYear },
          },
        },
        {
          $group: {
            _id: { month: { $month: { date: "$disbursementDate", timezone: DEFAULT_TIMEZONE } } },
            amount: { $sum: { $ifNull: ["$principalAmount", 0] } },
          },
        },
      ]),
    ]);

    const invoiceAmount = Array(12).fill(0);
    const transporterPayment = Array(12).fill(0);
    const driverSalary = Array(12).fill(0);
    const loanDisbursed = Array(12).fill(0);

    invoiceAgg.forEach((r) => {
      invoiceAmount[r._id.month - 1] = r.amount;
    });
    transporterAgg.forEach((r) => {
      transporterPayment[r._id.month - 1] = r.amount;
    });
    driverAgg.forEach((r) => {
      driverSalary[r._id.month - 1] = r.amount;
    });
    loanAgg.forEach((r) => {
      loanDisbursed[r._id.month - 1] = r.amount;
    });

    res.status(200).json({
      year,
      invoiceAmount,
      transporterPayment,
      driverSalary,
      loanDisbursed,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
});

// Get transporter payment totals for dashboard
const getTransporterPaymentSummary = asyncHandler(async (req, res) => {
  try {
    const [
      payableAgg,
      paidAgg,
      pendingSubtrips,
      payablePayments,
      paidPayments,
    ] = await Promise.all([
      TransporterPayment.aggregate([
        { $match: { tenant: req.tenant, status: 'generated' } },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ['$summary.netIncome', 0] } },
          },
        },
      ]),
      TransporterPayment.aggregate([
        { $match: { tenant: req.tenant, status: 'paid' } },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ['$summary.netIncome', 0] } },
          },
        },
      ]),
      Subtrip.find(
        addTenantToQuery(req, {
          subtripStatus: SUBTRIP_STATUS.RECEIVED,
          transporterPaymentReceiptId: { $exists: false },
        }),
      )
        .select(
          '_id subtripNo customerId loadingPoint unloadingPoint startDate endDate loadingWeight rate vehicleId driverId',
        )
        .populate('customerId', 'customerName')
        .populate({
          path: 'vehicleId',
          select: 'vehicleNo isOwn transporter',
          populate: { path: 'transporter', select: 'transportName' },
        })
        .populate({ path: 'driverId', select: 'driverName' })
        .populate('expenses')
        .lean(),
      TransporterPayment.find({ tenant: req.tenant, status: 'generated' })
        .select('_id paymentId issueDate status summary transporterId')
        .populate('transporterId', 'transportName')
        .lean(),
      TransporterPayment.find({ tenant: req.tenant, status: 'paid' })
        .select('_id paymentId issueDate status summary transporterId')
        .populate('transporterId', 'transportName')
        .lean(),
    ]);

    let pendingAmount = 0;
    const formattedPendingSubtrips = pendingSubtrips
      .filter((st) => st.vehicleId && !st.vehicleId.isOwn)
      .map((st) => {
        const { totalTransporterPayment, totalExpense, totalShortageAmount, totalFreightAmount } = calculateTransporterPayment(st);
        pendingAmount += totalTransporterPayment;
        return {
          _id: st._id,
          subtripNo: st.subtripNo,
          customerName: st.customerId?.customerName || null,
          loadingPoint: st.loadingPoint,
          unloadingPoint: st.unloadingPoint,
          startDate: st.startDate,
          endDate: st.endDate,
          loadingWeight: st.loadingWeight,
          rate: st.rate,
          transporter: st.vehicleId?.transporter?.transportName || null,
          vehicleNo: st.vehicleId?.vehicleNo || null,
          driver: st.driverId?.driverName || null,
          totalTransporterPayment,
          totalExpense,
          totalShortageAmount,
          totalFreightAmount,
          expenses: st.expenses || [],
        };
      });

    const payableAmount = payableAgg[0]?.total || 0;
    const paidAmount = paidAgg[0]?.total || 0;

    const formattedPayablePayments = payablePayments.map((p) => ({
      _id: p._id,
      paymentId: p.paymentId,
      transporterName: p.transporterId?.transportName || null,
      issueDate: p.issueDate,
      status: p.status,
      netIncome: p.summary?.netIncome || 0,
    }));

    const formattedPaidPayments = paidPayments.map((p) => ({
      _id: p._id,
      paymentId: p.paymentId,
      transporterName: p.transporterId?.transportName || null,
      issueDate: p.issueDate,
      status: p.status,
      netIncome: p.summary?.netIncome || 0,
    }));

    res.status(200).json({
      pendingAmount,
      pendingTransporterPayments: formattedPendingSubtrips,
      payableAmount,
      payablePayments: formattedPayablePayments,
      paidAmount,
      paidPayments: formattedPaidPayments,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
});

// Get invoice amounts summary for dashboard
const getInvoiceAmountSummary = asyncHandler(async (req, res) => {
  try {
    const [
      pendingAgg,
      receivedAgg,
      unbilledAgg,
      pendingInvoices,
      receivedInvoices,
      unbilledSubtrips,
    ] = await Promise.all([
      Invoice.aggregate([
        {
          $match: {
            tenant: req.tenant,
            invoiceStatus: {
              $in: [
                INVOICE_STATUS.PENDING,
                INVOICE_STATUS.PARTIAL_RECEIVED,
                INVOICE_STATUS.OVERDUE,
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $cond: [
                  { $eq: ["$invoiceStatus", INVOICE_STATUS.PARTIAL_RECEIVED] },
                  {
                    $subtract: [
                      { $ifNull: ["$netTotal", 0] },
                      { $ifNull: ["$totalReceived", 0] },
                    ],
                  },
                  { $ifNull: ["$netTotal", 0] },
                ],
              },
            },
          },
        },
      ]),
      Invoice.aggregate([
        {
          $match: {
            tenant: req.tenant,
            invoiceStatus: {
              $in: [INVOICE_STATUS.RECEIVED, INVOICE_STATUS.PARTIAL_RECEIVED],
            },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$totalReceived", 0] } },
          },
        },
      ]),
      Subtrip.aggregate([
        {
          $match: {
            tenant: req.tenant,
            $and: [
              {
                $or: [{ invoiceId: { $exists: false } }, { invoiceId: null }],
              },
              {
                subtripStatus: {
                  $in: [SUBTRIP_STATUS.RECEIVED],
                },
              },
            ],
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $multiply: [
                  { $ifNull: ["$loadingWeight", 0] },
                  { $ifNull: ["$rate", 0] },
                ],
              },
            },
          },
        },
      ]),
      Invoice.find({
        tenant: req.tenant,
        invoiceStatus: {
          $in: [
            INVOICE_STATUS.PENDING,
            INVOICE_STATUS.PARTIAL_RECEIVED,
            INVOICE_STATUS.OVERDUE,
          ],
        },
      })
        .select(
          "_id invoiceNo issueDate dueDate netTotal totalReceived invoiceStatus customerId payments"
        )
        .populate("customerId", "customerName"),
      Invoice.find({
        tenant: req.tenant,
        invoiceStatus: {
          $in: [INVOICE_STATUS.RECEIVED, INVOICE_STATUS.PARTIAL_RECEIVED],
        },
      })
        .select(
          "_id invoiceNo issueDate dueDate netTotal totalReceived invoiceStatus customerId payments"
        )
        .populate("customerId", "customerName"),
      Subtrip.find({
        tenant: req.tenant,
        $or: [{ invoiceId: { $exists: false } }, { invoiceId: null }],
        subtripStatus: SUBTRIP_STATUS.RECEIVED,
      })
        .select(
          "_id subtripNo customerId loadingPoint unloadingPoint startDate endDate loadingWeight rate vehicleId driverId"
        )
        .populate("customerId", "customerName")
        .populate({ path: "vehicleId", select: "vehicleNo isOwn" })
        .populate({ path: "driverId", select: "driverName" }),
    ]);

    const pendingAmount = pendingAgg[0]?.total || 0;
    const receivedAmount = receivedAgg[0]?.total || 0;
    const unbilledAmount = unbilledAgg[0]?.total || 0;
    const formattedPendingInvoices = pendingInvoices.map((inv) => ({
      _id: inv._id,
      invoiceNo: inv.invoiceNo,
      customerName: inv.customerId?.customerName || null,
      invoiceStatus: inv.invoiceStatus,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      netTotal: inv.netTotal,
      totalReceived: inv.totalReceived,
      payments: inv.payments || [],
    }));
    const formattedReceivedInvoices = receivedInvoices.map((inv) => ({
      _id: inv._id,
      invoiceNo: inv.invoiceNo,
      customerName: inv.customerId?.customerName || null,
      invoiceStatus: inv.invoiceStatus,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      netTotal: inv.netTotal,
      totalReceived: inv.totalReceived,
      payments: inv.payments || [],
    }));
    const formattedUnbilledSubtrips = unbilledSubtrips.map((st) => ({
      _id: st._id,
      subtripNo: st.subtripNo,
      customerName: st.customerId?.customerName || null,
      startDate: st.startDate,
      receivedDate: st.endDate,
      loadingPoint: st.loadingPoint,
      loadingWeight: st.loadingWeight,
      rate: st.rate,
      unloadingPoint: st.unloadingPoint,
      unloadingDate: st.endDate,
      vehicleNo: st.vehicleId?.vehicleNo || null,
      driver: st.driverId?.driverName || null,
      subtripType: st.vehicleId?.isOwn ? "own" : "market",
    }));

    res.status(200).json({
      pendingAmount,
      pendingInvoices: formattedPendingInvoices,
      receivedAmount,
      receivedInvoices: formattedReceivedInvoices,
      unbilledAmount,
      unbilledSubtrips: formattedUnbilledSubtrips,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
});

// Get monthly subtrip count, weight, distance and diesel usage per own vehicle
const getMonthlyVehicleSubtripSummary = asyncHandler(async (req, res) => {
  const { month } = req.query;

  if (!month) {
    return res
      .status(400)
      .json({ message: "Month query parameter required in YYYY-MM format" });
  }

  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(monthNum) ||
    monthNum < 1 ||
    monthNum > 12
  ) {
    return res
      .status(400)
      .json({ message: "Invalid month format. Use YYYY-MM" });
  }

  const startDate = getStartOfMonthIST(year, monthNum);
  const endDate = getNextMonthStartIST(year, monthNum);

  try {
    // Aggregate subtrip metrics per own vehicle
    const subtripAgg = await Subtrip.aggregate([
      {
        $match: {
          tenant: req.tenant,
          startDate: { $gte: startDate, $lt: endDate },
          subtripStatus: {
            $nin: [SUBTRIP_STATUS.IN_QUEUE, SUBTRIP_STATUS.LOADED],
          },
        },
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicleId",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      { $unwind: "$vehicle" },
      { $match: { "vehicle.isOwn": true } },
      {
        $lookup: {
          from: "expenses",
          localField: "expenses",
          foreignField: "_id",
          as: "expenses",
        },
      },
      {
        $lookup: {
          from: "trips",
          localField: "tripId",
          foreignField: "_id",
          as: "trip",
        },
      },
      {
        $unwind: {
          path: "$trip",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          tripDistance: {
            $cond: [
              {
                $and: [
                  { $ne: ["$trip.startKm", null] },
                  { $ne: ["$trip.endKm", null] },
                ],
              },
              { $abs: { $subtract: ["$trip.endKm", "$trip.startKm"] } },
              0,
            ],
          },
          dieselUsed: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$expenses",
                    as: "e",
                    cond: {
                      $or: [
                        { $eq: ["$$e.expenseType", "diesel"] },
                        { $eq: ["$$e.expenseType", "Diesel"] },
                      ],
                    },
                  },
                },
                as: "d",
                in: { $ifNull: ["$$d.dieselLtr", 0] },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: { $ifNull: ["$tripId", "$_id"] },
          vehicleId: { $first: "$vehicle._id" },
          vehicleNo: { $first: "$vehicle.vehicleNo" },
          subtripCount: { $sum: 1 },
          totalLoadingWeight: { $sum: { $ifNull: ["$loadingWeight", 0] } },
          tripDistance: { $first: "$tripDistance" },
          totalDiesel: { $sum: "$dieselUsed" },
        },
      },
      {
        $group: {
          _id: "$vehicleId",
          vehicleNo: { $first: "$vehicleNo" },
          subtripCount: { $sum: "$subtripCount" },
          totalLoadingWeight: { $sum: "$totalLoadingWeight" },
          totalKm: { $sum: "$tripDistance" },
          totalDiesel: { $sum: "$totalDiesel" },
        },
      },
      {
        $project: {
          _id: 0,
          vehicleId: "$_id",
          vehicleNo: 1,
          subtripCount: 1,
          totalLoadingWeight: 1,
          totalKm: 1,
          totalDiesel: 1,
        },
      },
    ]);

    // Fetch all own vehicles to include those without subtrips
    const allVehicles = await Vehicle.find(
      addTenantToQuery(req, { isOwn: true })
    )
      .select("_id vehicleNo")
      .lean();

    const subtripMap = new Map();
    subtripAgg.forEach((r) => {
      subtripMap.set(String(r.vehicleId), r);
    });

    const results = allVehicles
      .map((v) => {
        const data = subtripMap.get(String(v._id)) || {};
        return {
          vehicleId: v._id,
          vehicleNo: v.vehicleNo,
          subtripCount: data.subtripCount || 0,
          totalLoadingWeight: data.totalLoadingWeight || 0,
          totalKm: data.totalKm || 0,
          totalDiesel: data.totalDiesel || 0,
        };
      })
      .sort((a, b) => b.subtripCount - a.subtripCount);

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching vehicle subtrip summary",
      error: error.message,
    });
  }
});

// Get monthly subtrip count and weight per own vehicle driver
const getMonthlyDriverSummary = asyncHandler(async (req, res) => {
  const { month } = req.query;

  if (!month) {
    return res
      .status(400)
      .json({ message: "Month query parameter required in YYYY-MM format" });
  }

  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(monthNum) ||
    monthNum < 1 ||
    monthNum > 12
  ) {
    return res
      .status(400)
      .json({ message: "Invalid month format. Use YYYY-MM" });
  }

  const startDate = getStartOfMonthIST(year, monthNum);
  const endDate = getNextMonthStartIST(year, monthNum);

  try {
    const results = await Subtrip.aggregate([
      {
        $match: {
          tenant: req.tenant,
          startDate: { $gte: startDate, $lt: endDate },
          subtripStatus: {
            $nin: [SUBTRIP_STATUS.IN_QUEUE, SUBTRIP_STATUS.LOADED],
          },
        },
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicleId",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      { $unwind: "$vehicle" },
      { $match: { "vehicle.isOwn": true } },
      {
        $lookup: {
          from: "drivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driver",
        },
      },
      { $unwind: "$driver" },
      {
        $group: {
          _id: "$driver._id",
          driverName: { $first: "$driver.driverName" },
          subtripCount: { $sum: 1 },
          totalLoadingWeight: { $sum: { $ifNull: ["$loadingWeight", 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          driverId: "$_id",
          driverName: 1,
          subtripCount: 1,
          totalLoadingWeight: 1,
        },
      },
      { $sort: { subtripCount: -1 } },
    ]);

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching driver subtrip summary",
      error: error.message,
    });
  }
});

// Get monthly subtrip count and weight per transporter owned vehicles
const getMonthlyTransporterSummary = asyncHandler(async (req, res) => {
  const { month } = req.query;

  if (!month) {
    return res
      .status(400)
      .json({ message: "Month query parameter required in YYYY-MM format" });
  }

  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(monthNum) ||
    monthNum < 1 ||
    monthNum > 12
  ) {
    return res
      .status(400)
      .json({ message: "Invalid month format. Use YYYY-MM" });
  }

  const startDate = getStartOfMonthIST(year, monthNum);
  const endDate = getNextMonthStartIST(year, monthNum);

  try {
    const results = await Subtrip.aggregate([
      {
        $match: {
          tenant: req.tenant,
          startDate: { $gte: startDate, $lt: endDate },
          subtripStatus: {
            $nin: [SUBTRIP_STATUS.IN_QUEUE, SUBTRIP_STATUS.LOADED],
          },
        },
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicleId",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      { $unwind: "$vehicle" },
      { $match: { "vehicle.isOwn": false } },
      {
        $lookup: {
          from: "transporters",
          localField: "vehicle.transporter",
          foreignField: "_id",
          as: "transporter",
        },
      },
      { $unwind: "$transporter" },
      {
        $group: {
          _id: {
            transporterId: "$transporter._id",
            hasPayment: {
              $cond: [
                { $ifNull: ["$transporterPaymentReceiptId", false] },
                true,
                false,
              ],
            },
          },
          transporterName: { $first: "$transporter.transportName" },
          subtripCount: { $sum: 1 },
          totalLoadingWeight: { $sum: { $ifNull: ["$loadingWeight", 0] } },
          totalCommission: {
            $sum: {
              $multiply: [
                { $ifNull: ["$loadingWeight", 0] },
                { $ifNull: ["$commissionRate", 0] },
              ],
            },
          },
        },
      },
      {
        $group: {
          _id: "$_id.transporterId",
          transporterName: { $first: "$transporterName" },
          subtripCount: { $sum: "$subtripCount" },
          totalLoadingWeight: { $sum: "$totalLoadingWeight" },
          totalCommission: { $sum: "$totalCommission" },
          paymentDone: {
            $sum: {
              $cond: ["$_id.hasPayment", "$subtripCount", 0],
            },
          },
          pendingForPayment: {
            $sum: {
              $cond: ["$_id.hasPayment", 0, "$subtripCount"],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          transporterId: "$_id",
          transporterName: 1,
          subtripCount: 1,
          totalLoadingWeight: 1,
          totalCommission: 1,
          pendingForPayment: 1,
          paymentDone: 1,
        },
      },
      { $sort: { subtripCount: -1 } },
    ]);

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching transporter subtrip summary",
      error: error.message,
    });
  }
});

// (Exports moved to bottom with getDailySummary)

// Get day-wise dashboard summary
const getDailySummary = asyncHandler(async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res
      .status(400)
      .json({ message: "date query parameter required in YYYY-MM-DD format" });
  }

  const [yearStr, monthStr, dayStr] = date.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const dayNum = parseInt(dayStr, 10);

  if (
    Number.isNaN(year) ||
    Number.isNaN(monthNum) ||
    Number.isNaN(dayNum) ||
    monthNum < 1 ||
    monthNum > 12 ||
    dayNum < 1 ||
    dayNum > 31
  ) {
    return res
      .status(400)
      .json({ message: "Invalid date format. Use YYYY-MM-DD" });
  }

  const startOfDay = dayjs.tz(`${date}`, DEFAULT_TIMEZONE).startOf('day').toDate();
  const endOfDay = dayjs.tz(`${date}`, DEFAULT_TIMEZONE).add(1, 'day').startOf('day').toDate();

  try {
    // helper: resolve subtrips from event list supporting ObjectId or subtripNo strings
    const fetchSubtripsFromEvents = async (events) => {
      const validIds = new Set();
      const subtripNos = new Set();

      for (const e of events) {
        const v = e.subtripId;
        if (!v) continue;
        // Handle ObjectId instance
        if (typeof v === 'object' && v._id) {
          validIds.add(String(v._id));
        } else if (typeof v === 'object' && v.toString) {
          const s = v.toString();
          if (mongoose.Types.ObjectId.isValid(s)) validIds.add(s);
          else subtripNos.add(s);
        } else if (typeof v === 'string') {
          if (mongoose.Types.ObjectId.isValid(v)) validIds.add(v);
          else subtripNos.add(v);
        }
      }

      const or = [];
      if (validIds.size) or.push({ _id: { $in: Array.from(validIds) } });
      if (subtripNos.size) or.push({ subtripNo: { $in: Array.from(subtripNos) } });

      if (!or.length) return [];

      return Subtrip.find({ tenant: req.tenant, $or: or })
        .select(
          '_id subtripNo startDate endDate loadingPoint unloadingPoint loadingWeight rate materialType subtripStatus customerId vehicleId driverId'
        )
        .populate('customerId', 'customerName')
        .populate({
          path: 'vehicleId',
          select: 'vehicleNo isOwn transporter',
          populate: { path: 'transporter', select: 'transportName' },
        })
        .populate('driverId', 'driverName')
        .lean();
    };
    // 1. Subtrips created on the day (via SubtripEvent CREATED)
    const createdEvents = await SubtripEvent
      .find({
        tenant: req.tenant,
        eventType: 'CREATED',
        timestamp: { $gte: startOfDay, $lt: endOfDay },
      })
      .select('subtripId timestamp')
      .lean();

    const createdSubtrips = await fetchSubtripsFromEvents(createdEvents);


    // Consolidated material summary (by loadingWeight) for loaded subtrips
    const materialsMap = new Map();
    for (const st of createdSubtrips) {
      const key = st.materialType;
      const wt = Number(st.loadingWeight) || 0;
      if (!key || wt <= 0) continue;
      materialsMap.set(key, (materialsMap.get(key) || 0) + wt);
    }
    const materials = Array.from(materialsMap.entries())
      .map(([materialType, totalLoadingWeight]) => ({ materialType, totalLoadingWeight, amount: totalLoadingWeight }))
      .sort((a, b) => b.totalLoadingWeight - a.totalLoadingWeight);
    const materialsTotalWeight = materials.reduce((sum, m) => sum + (m.totalLoadingWeight || 0), 0);

    // 3. Subtrips received on the day (RECEIVED or ERROR_RESOLVED events)
    const receivedEvents = await SubtripEvent
      .find({
        tenant: req.tenant,
        eventType: { $in: ['RECEIVED', 'ERROR_RESOLVED'] },
        timestamp: { $gte: startOfDay, $lt: endOfDay },
      })
      .select('subtripId timestamp')
      .lean();

    const receivedSubtrips = await fetchSubtripsFromEvents(receivedEvents);

    // 4 & 6. Invoices generated on the day + Billed subtrips derived from invoices
    const invoices = await Invoice.find({
      tenant: req.tenant,
      issueDate: { $gte: startOfDay, $lt: endOfDay },
    })
      .select('_id invoiceNo issueDate netTotal customerId invoiceStatus subtripSnapshot')
      .populate('customerId', 'customerName')
      .lean();

    const invoiceCount = invoices.length;
    const invoiceTotalAmount = invoices.reduce((sum, inv) => sum + (inv.netTotal || 0), 0);

    // 5. Transporter payments generated on the day
    const transporterPayments = await TransporterPayment.find({
      tenant: req.tenant,
      issueDate: { $gte: startOfDay, $lt: endOfDay },
    })
      .select('_id paymentId issueDate status summary transporterId')
      .populate('transporterId', 'transportName')
      .lean();

    const transporterPaymentCount = transporterPayments.length;
    const transporterPaymentTotalAmount = transporterPayments.reduce(
      (sum, p) => sum + (p.summary?.netIncome || 0),
      0,
    );

    // 7. Expenses on the given day
    const expensesOnDate = await Expense.find({
      tenant: req.tenant,
      date: { $gte: startOfDay, $lt: endOfDay },
    })
      .select(
        '_id date expenseCategory expenseType amount paidThrough remarks dieselLtr dieselPrice adblueLiters adbluePrice vehicleId subtripId pumpCd'
      )
      .populate('vehicleId', 'vehicleNo')
      .populate('subtripId', 'subtripNo')
      .populate('pumpCd', 'pumpName')
      .lean();

    const totalExpenseAmount = expensesOnDate.reduce((sum, e) => sum + (e.amount || 0), 0);

    // 8. Transporter Advances on the given day
    const advancesOnDate = await TransporterAdvance.find({
      tenant: req.tenant,
      date: { $gte: startOfDay, $lt: endOfDay },
    })
      .select(
        '_id date advanceType amount paidThrough remarks dieselLtr dieselPrice adblueLiters adbluePrice vehicleId subtripId pumpCd'
      )
      .populate('vehicleId', 'vehicleNo')
      .populate('subtripId', 'subtripNo')
      .populate('pumpCd', 'pumpName')
      .lean();

    const totalAdvanceAmount = advancesOnDate.reduce((sum, a) => sum + (a.amount || 0), 0);

    res.status(200).json({
      date,
      subtrips: {
        created: { count: createdSubtrips.length, list: createdSubtrips },
        received: { count: receivedSubtrips.length, list: receivedSubtrips },
      },
      materials: {
        amount: materialsTotalWeight,
        list: materials,
      },
      invoices: {
        count: invoiceCount,
        amount: invoiceTotalAmount,
        list: invoices.map((inv) => ({
          _id: inv._id,
          invoiceNo: inv.invoiceNo,
          issueDate: inv.issueDate,
          customerName: inv.customerId?.customerName || null,
          status: inv.invoiceStatus,
          netTotal: inv.netTotal,
        })),
      },
      transporterPayments: {
        count: transporterPaymentCount,
        amount: transporterPaymentTotalAmount,
        list: transporterPayments.map((p) => ({
          _id: p._id,
          paymentId: p.paymentId,
          transporterName: p.transporterId?.transportName || null,
          issueDate: p.issueDate,
          status: p.status,
          netIncome: p.summary?.netIncome || 0,
        })),
      },
      expenses: {
        count: expensesOnDate.length,
        amount: totalExpenseAmount,
        list: expensesOnDate,
      },
      advances: {
        count: advancesOnDate.length,
        amount: totalAdvanceAmount,
        list: advancesOnDate,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

// Tyre dashboard summary (pie chart by status + key stats)
const getTyreDashboardSummary = asyncHandler(async (req, res) => {
  try {
    const baseQuery = { tenant: req.tenant, isActive: { $ne: false } };

    const [statusAgg, valueAgg, kmAgg, lowThreadCount] = await Promise.all([
      // 1. Count by status
      Tyre.aggregate([
        { $match: baseQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      // 2. Total cost value
      Tyre.aggregate([
        { $match: baseQuery },
        { $group: { _id: null, totalValue: { $sum: { $ifNull: ['$cost', 0] } } } },
      ]),
      // 3. Average KM per tyre
      Tyre.aggregate([
        { $match: baseQuery },
        { $group: { _id: null, avgKm: { $avg: { $ifNull: ['$currentKm', 0] } } } },
      ]),
      // 4. Low thread-depth alerts (current ≤ 25% of original, only where original > 0)
      Tyre.countDocuments({
        ...baseQuery,
        'threadDepth.original': { $gt: 0 },
        $expr: {
          $lte: [
            '$threadDepth.current',
            { $multiply: ['$threadDepth.original', 0.25] },
          ],
        },
      }),
    ]);

    // Build status map
    const statusMap = {};
    Object.values(TYRE_STATUS).forEach((s) => { statusMap[s] = 0; });
    statusAgg.forEach((r) => { statusMap[r._id] = r.count; });

    const totalCount = Object.values(statusMap).reduce((a, b) => a + b, 0);

    res.status(200).json({
      statusBreakdown: [
        { label: 'In Stock', value: statusMap[TYRE_STATUS.IN_STOCK] },
        { label: 'Mounted', value: statusMap[TYRE_STATUS.MOUNTED] },
        { label: 'Scrapped', value: statusMap[TYRE_STATUS.SCRAPPED] },
      ],
      totalCount,
      totalValue: valueAgg[0]?.totalValue || 0,
      avgKm: Math.round(kmAgg[0]?.avgKm || 0),
      lowThreadAlerts: lowThreadCount,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

// Detailed tyre dashboard summary for the Tyre page
const getTyreDetailedDashboard = asyncHandler(async (req, res) => {
  try {
    const baseQuery = { tenant: req.tenant, isActive: { $ne: false } };

    const [
      statusAgg,
      typeAgg,
      brandAgg,
      sizeAgg,
      ageAgg,
      threadAgg,
      attachmentAgg,
      metricsAgg,
      historyAgg,
      liveKmAgg
    ] = await Promise.all([
      // 1. Status distribution
      Tyre.aggregate([
        { $match: baseQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
      // 2. Type distribution
      Tyre.aggregate([
        { $match: baseQuery },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),

      // 3. Brand summary
      Tyre.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: '$brand',
            count: { $sum: 1 },
            mounted: { $sum: { $cond: [{ $eq: ['$status', TYRE_STATUS.MOUNTED] }, 1, 0] } },
            inStock: { $sum: { $cond: [{ $eq: ['$status', TYRE_STATUS.IN_STOCK] }, 1, 0] } },
            scrapped: { $sum: { $cond: [{ $eq: ['$status', TYRE_STATUS.SCRAPPED] }, 1, 0] } },
            totalValue: { $sum: { $ifNull: ['$cost', 0] } },
            avgKm: { $avg: { $ifNull: ['$currentKm', 0] } }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),

      // 4. Size summary
      Tyre.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: '$size',
            count: { $sum: 1 },
            mounted: { $sum: { $cond: [{ $eq: ['$status', TYRE_STATUS.MOUNTED] }, 1, 0] } },
            inStock: { $sum: { $cond: [{ $eq: ['$status', TYRE_STATUS.IN_STOCK] }, 1, 0] } },
            scrapped: { $sum: { $cond: [{ $eq: ['$status', TYRE_STATUS.SCRAPPED] }, 1, 0] } }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),

      // 5. Age distribution
      Tyre.aggregate([
        { $match: baseQuery },
        {
          $project: {
            ageInMonths: {
              $dateDiff: {
                startDate: '$purchaseDate',
                endDate: new Date(),
                unit: 'month'
              }
            }
          }
        },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $lt: ['$ageInMonths', 6] }, then: 'lt6Months' },
                  { case: { $lt: ['$ageInMonths', 12] }, then: 'lt1Year' },
                  { case: { $lt: ['$ageInMonths', 24] }, then: 'lt2Years' }
                ],
                default: 'gt2Years'
              }
            },
            count: { $sum: 1 }
          }
        }
      ]),

      // 6. Thread health
      Tyre.aggregate([
        { $match: baseQuery },
        {
          $project: {
            healthRatio: {
              $cond: [
                { $gt: ['$threadDepth.original', 0] },
                { $divide: ['$threadDepth.current', '$threadDepth.original'] },
                -1 // unknown
              ]
            }
          }
        },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $eq: ['$healthRatio', -1] }, then: 'unknown' },
                  { case: { $lte: ['$healthRatio', 0.25] }, then: 'critical' },
                  { case: { $lte: ['$healthRatio', 0.5] }, then: 'warning' }
                ],
                default: 'healthy'
              }
            },
            count: { $sum: 1 }
          }
        }
      ]),

      // 7. Attachment Summary using TyreHistory
      TyreHistory.aggregate([
        { $match: { tenant: req.tenant, action: 'MOUNT' } },
        { $group: { _id: '$tyre', mountCount: { $sum: 1 } } }
      ]),

      // 8. Key metrics
      Tyre.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: null,
            totalValue: { $sum: { $ifNull: ['$cost', 0] } },
            avgKmPerTyre: { $avg: { $ifNull: ['$currentKm', 0] } },
            remoldedCount: { $sum: { $cond: [{ $gt: ['$metadata.remoldCount', 0] }, 1, 0] } },
            totalRemholds: { $sum: { $ifNull: ['$metadata.remoldCount', 0] } }
          }
        }
      ]),

      // 9. Recent Activity (30 days)
      TyreHistory.aggregate([
        { 
          $match: { 
            tenant: req.tenant,
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
          }
        },
        { $group: { _id: '$action', count: { $sum: 1 } } }
      ]),

      // 10. Live KM freshness for MOUNTED tyres
      Tyre.aggregate([
        { $match: { ...baseQuery, status: TYRE_STATUS.MOUNTED } },
        {
          $lookup: {
            from: 'vehicles',
            localField: 'currentVehicleId',
            foreignField: '_id',
            as: 'vehicle'
          }
        },
        { $unwind: { path: '$vehicle', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            daysSinceUpdate: {
              $cond: [
                { $ifNull: ['$vehicle.currentOdometerUpdatedAt', false] },
                {
                  $dateDiff: {
                    startDate: '$vehicle.currentOdometerUpdatedAt',
                    endDate: new Date(),
                    unit: 'day'
                  }
                },
                -1
              ]
            }
          }
        },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $eq: ['$daysSinceUpdate', -1] }, then: 'unknown' },
                  { case: { $lt: ['$daysSinceUpdate', 3] }, then: 'fresh' },
                  { case: { $lte: ['$daysSinceUpdate', 10] }, then: 'warning' }
                ],
                default: 'stale'
              }
            },
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Format Attachment Summary
    const tyres = await Tyre.find(baseQuery).select('_id status').lean();
    
    let newlyAttached = 0;
    let oldAttached = 0;
    let neverAttached = 0;

    const mountCountMap = {};
    attachmentAgg.forEach(item => {
      mountCountMap[item._id.toString()] = item.mountCount;
    });

    tyres.forEach(tyre => {
      const mountCount = mountCountMap[tyre._id.toString()] || 0;
      if (mountCount === 0) {
        neverAttached++;
      } else if (tyre.status === TYRE_STATUS.MOUNTED) {
        if (mountCount === 1) {
          newlyAttached++;
        } else {
          oldAttached++;
        }
      }
    });

    // Format standard maps
    const formatBucket = (aggData) => {
      const output = {};
      aggData.forEach(item => {
        if(item._id) output[item._id] = item.count;
      });
      return output;
    };

    const threadMap = formatBucket(threadAgg);
    const ageMap = formatBucket(ageAgg);
    const liveKmMap = formatBucket(liveKmAgg);
    const metrics = metricsAgg[0] || {
      totalValue: 0,
      avgKmPerTyre: 0,
      remoldedCount: 0,
      totalRemholds: 0
    };

    res.status(200).json({
      statusSummary: formatBucket(statusAgg),
      typeSummary: typeAgg.map(t => ({ type: t._id, count: t.count })),
      brandSummary: brandAgg.map(b => ({ brand: b._id, ...b })),
      sizeSummary: sizeAgg.map(s => ({ size: s._id, ...s })),
      attachmentSummary: {
        newlyAttached,
        oldAttached,
        neverAttached,
        total: tyres.length
      },
      agingSummary: {
        lt6Months: ageMap['lt6Months'] || 0,
        lt1Year: ageMap['lt1Year'] || 0,
        lt2Years: ageMap['lt2Years'] || 0,
        gt2Years: ageMap['gt2Years'] || 0
      },
      threadHealthSummary: {
        healthy: threadMap['healthy'] || 0,
        warning: threadMap['warning'] || 0,
        critical: threadMap['critical'] || 0,
        unknown: threadMap['unknown'] || 0
      },
      topStats: {
        totalValue: metrics.totalValue,
        avgKmPerTyre: metrics.avgKmPerTyre,
        remoldedCount: metrics.remoldedCount,
        avgRemoldCount: metrics.remoldedCount > 0 ? (metrics.totalRemholds / metrics.remoldedCount) : 0,
        lowThreadAlerts: threadMap['critical'] || 0
      },
      recentActivity: historyAgg.map(h => ({ action: h._id, count: h.count })),
      liveKmSummary: {
        fresh: liveKmMap['fresh'] || 0,
        warning: liveKmMap['warning'] || 0,
        stale: liveKmMap['stale'] || 0,
        unknown: liveKmMap['unknown'] || 0
      }
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});


// Inventory dashboard summary — matches part list view analytics
const getInventoryDashboardSummary = asyncHandler(async (req, res) => {
  try {
    const pipeline = [
      { $match: { tenant: req.tenant, isActive: { $ne: false } } },
      {
        $lookup: {
          from: 'partstocks',
          localField: '_id',
          foreignField: 'part',
          as: 'inventories',
        },
      },
      {
        $unwind: {
          path: '$inventories',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: '$_id',
          unitCost: { $first: '$unitCost' },
          totalQuantity: {
            $sum: { $ifNull: ['$inventories.quantity', 0] },
          },
          threshold: { $max: { $ifNull: ['$inventories.threshold', 0] } },
        },
      },
      {
        $group: {
          _id: null,
          totalQuantityItems: { $sum: '$totalQuantity' },
          outOfStockItems: {
            $sum: {
              $cond: [{ $lte: ['$totalQuantity', 0] }, 1, 0],
            },
          },
          lowStockItems: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ['$totalQuantity', '$threshold'] },
                    { $gt: ['$totalQuantity', 0] }
                  ]
                },
                1,
                0
              ],
            },
          },
          totalInventoryValue: {
            $sum: { $multiply: ['$totalQuantity', '$unitCost'] },
          },
          totalParts: { $sum: 1 },
        },
      },
    ];

    const [inventoryTotals, openPurchaseOrders] = await Promise.all([
      Part.aggregate(pipeline),
      PurchaseOrder.countDocuments({
        tenant: req.tenant,
        status: {
          $in: [
            PURCHASE_ORDER_STATUS.PENDING_APPROVAL,
            PURCHASE_ORDER_STATUS.PURCHASED,
            PURCHASE_ORDER_STATUS.PARTIAL_RECEIVED,
          ],
        },
      }),
    ]);

    const totals = inventoryTotals[0] || {
      totalQuantityItems: 0,
      outOfStockItems: 0,
      lowStockItems: 0,
      totalInventoryValue: 0,
      totalParts: 0,
    };

    const inStockItems = totals.totalParts - totals.outOfStockItems - totals.lowStockItems;

    res.status(200).json({
      lowStockAlerts: totals.outOfStockItems + totals.lowStockItems, // Deprecated maybe but keeping just in case
      totalInventoryValue: totals.totalInventoryValue,
      totalQuantity: totals.totalQuantityItems,
      // newly added attributes:
      totalParts: totals.totalParts,
      outOfStockItems: totals.outOfStockItems,
      lowStockItems: totals.lowStockItems,
      inStockItems: inStockItems > 0 ? inStockItems : 0, 
      openPurchaseOrders,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

// WorkOrder dashboard summary
const getWorkOrderDashboardSummary = asyncHandler(async (req, res) => {
  try {
    const pipeline = [
      { $match: { tenant: req.tenant } },
      {
        $group: {
          _id: null,
          totalWorkOrders: { $sum: 1 },
          openWorkOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', WORK_ORDER_STATUS.OPEN] }, 1, 0],
            },
          },
          pendingWorkOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', WORK_ORDER_STATUS.PENDING] }, 1, 0],
            },
          },
          completedWorkOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', WORK_ORDER_STATUS.COMPLETED] }, 1, 0],
            },
          },
        },
      },
    ];

    const result = await WorkOrder.aggregate(pipeline);

    const totals = result[0] || {
      totalWorkOrders: 0,
      openWorkOrders: 0,
      pendingWorkOrders: 0,
      completedWorkOrders: 0,
    };

    res.status(200).json(totals);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

// Detailed Maintenance & Inventory Dashboard
const getMaintenanceDashboard = asyncHandler(async (req, res) => {
  try {
    const tenantQuery = { tenant: req.tenant };

    // Analytics filters
    const months = parseInt(req.query.months, 10) || 6;
    const slowMovingDays = parseInt(req.query.slowMovingDays, 10) || 90;
    const analyticsDateFrom = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);

    const [
      // Parts
      partCount,
      partCategoryAgg,
      partStockAgg,
      lowStockAgg,
      outOfStockAgg,
      totalInventoryValueAgg,
      // Locations
      locationCount,
      locationStockAgg,
      // Purchase Orders
      poStatusAgg,
      poTotalSpendAgg,
      topVendorAgg,
      recentPOs,
      // Work Orders
      woStatusAgg,
      woCategoryAgg,
      woMonthlyCostAgg,
      recentWOs,
      // Vendors
      vendorCount,
      // Transactions
      recentTransactionAgg,
      // Analytics
      topPartsUsedAgg,
      vehiclesWithMostWOsAgg,
      vehiclesConsumingMostPartsAgg,
      topPartsByCostAgg,
      repeatFailuresAgg,
      partsConsumptionTrendAgg,
      priorityDistributionAgg,
      resolutionTimeAgg,
      slowMovingPartsAgg,
      completionRateAgg
    ] = await Promise.all([
      // 1. Total parts count
      Part.countDocuments({ ...tenantQuery, isActive: { $ne: false } }),

      // 2. Parts by category
      Part.aggregate([
        { $match: { ...tenantQuery, isActive: { $ne: false } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),

      // 3. Stock summary per part (total quantity across locations)
      PartStock.aggregate([
        { $match: tenantQuery },
        {
          $group: {
            _id: null,
            totalQuantity: { $sum: '$quantity' },
            totalStockEntries: { $sum: 1 }
          }
        }
      ]),

      // 4. Low stock parts (quantity > 0 but below threshold)
      PartStock.aggregate([
        { $match: tenantQuery },
        {
          $group: {
            _id: '$part',
            totalQuantity: { $sum: '$quantity' },
            maxThreshold: { $max: '$threshold' }
          }
        },
        {
          $match: {
            $expr: {
              $and: [
                { $gt: ['$totalQuantity', 0] },
                { $gt: ['$maxThreshold', 0] },
                { $lt: ['$totalQuantity', '$maxThreshold'] }
              ]
            }
          }
        },
        { $count: 'count' }
      ]),

      // 5. Out of stock parts
      PartStock.aggregate([
        { $match: tenantQuery },
        {
          $group: {
            _id: '$part',
            totalQuantity: { $sum: '$quantity' }
          }
        },
        { $match: { totalQuantity: { $lte: 0 } } },
        { $count: 'count' }
      ]),

      // 6. Total inventory value
      PartStock.aggregate([
        { $match: tenantQuery },
        {
          $lookup: {
            from: 'parts',
            localField: 'part',
            foreignField: '_id',
            as: 'partDoc'
          }
        },
        { $unwind: '$partDoc' },
        {
          $group: {
            _id: null,
            totalValue: { $sum: { $multiply: ['$quantity', { $ifNull: ['$partDoc.unitCost', 0] }] } }
          }
        }
      ]),

      // 7. Location count
      PartLocation.countDocuments({ ...tenantQuery, isActive: { $ne: false } }),

      // 8. Stock per location
      PartStock.aggregate([
        { $match: tenantQuery },
        {
          $lookup: {
            from: 'partlocations',
            localField: 'inventoryLocation',
            foreignField: '_id',
            as: 'location'
          }
        },
        { $unwind: '$location' },
        {
          $group: {
            _id: '$inventoryLocation',
            locationName: { $first: '$location.name' },
            totalQuantity: { $sum: '$quantity' },
            uniqueParts: { $addToSet: '$part' }
          }
        },
        {
          $project: {
            _id: 0,
            locationId: '$_id',
            locationName: 1,
            totalQuantity: 1,
            uniquePartCount: { $size: '$uniqueParts' }
          }
        },
        { $sort: { totalQuantity: -1 } }
      ]),

      // 9. PO status distribution
      PurchaseOrder.aggregate([
        { $match: tenantQuery },
        { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$total' } } }
      ]),

      // 10. Total PO spend
      PurchaseOrder.aggregate([
        {
          $match: {
            ...tenantQuery,
            status: { $in: [PURCHASE_ORDER_STATUS.PURCHASED, PURCHASE_ORDER_STATUS.RECEIVED, PURCHASE_ORDER_STATUS.PARTIAL_RECEIVED] }
          }
        },
        { $group: { _id: null, totalSpend: { $sum: '$total' }, avgOrderValue: { $avg: '$total' } } }
      ]),

      // 11. Top vendors by PO count
      PurchaseOrder.aggregate([
        { $match: tenantQuery },
        {
          $lookup: {
            from: 'vendors',
            localField: 'vendor',
            foreignField: '_id',
            as: 'vendorDoc'
          }
        },
        { $unwind: '$vendorDoc' },
        {
          $group: {
            _id: '$vendor',
            vendorName: { $first: '$vendorDoc.name' },
            orderCount: { $sum: 1 },
            totalSpend: { $sum: '$total' }
          }
        },
        { $sort: { totalSpend: -1 } },
        { $limit: 5 }
      ]),

      // 12. Recent POs (last 5)
      PurchaseOrder.find(tenantQuery)
        .sort({ createdAt: -1 })
        .limit(5)
        .select('purchaseOrderNo status total createdAt vendor')
        .populate('vendor', 'name')
        .lean(),

      // 13. WO status distribution
      WorkOrder.aggregate([
        { $match: tenantQuery },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalCost: { $sum: { $ifNull: ['$totalCost', 0] } }
          }
        }
      ]),

      // 14. WO by category
      WorkOrder.aggregate([
        { $match: tenantQuery },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            totalCost: { $sum: { $ifNull: ['$totalCost', 0] } }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 8 }
      ]),

      // 15. WO monthly cost (last 6 months)
      WorkOrder.aggregate([
        {
          $match: {
            ...tenantQuery,
            createdAt: { $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 },
            totalCost: { $sum: { $ifNull: ['$totalCost', 0] } },
            labourCost: { $sum: { $ifNull: ['$labourCharge', 0] } },
            partsCost: { $sum: { $ifNull: ['$partsCost', 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // 16. Recent WOs (last 5)
      WorkOrder.find(tenantQuery)
        .sort({ createdAt: -1 })
        .limit(5)
        .select('workOrderNo status category priority totalCost vehicle createdAt')
        .populate('vehicle', 'vehicleNo')
        .lean(),

      // 17. Vendor count
      Vendor.countDocuments({ ...tenantQuery, isActive: { $ne: false } }),

      // 18. Recent transactions (inventory movement, last 30 days)
      PartTransaction.aggregate([
        {
          $match: {
            ...tenantQuery,
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalQtyChange: { $sum: { $abs: '$quantityChange' } }
          }
        },
        { $sort: { count: -1 } }
      ]),

      // ─── ANALYTICS AGGREGATIONS ──────────────────────────────────────────

      // 19. Top parts used across completed WOs
      WorkOrder.aggregate([
        { $match: { ...tenantQuery, status: WORK_ORDER_STATUS.COMPLETED, createdAt: { $gte: analyticsDateFrom } } },
        { $unwind: '$parts' },
        { $match: { 'parts.part': { $exists: true, $ne: null } } },
        {
          $group: {
            _id: '$parts.part',
            totalQuantity: { $sum: '$parts.quantity' },
            workOrderIds: { $addToSet: '$_id' },
            partName: { $first: '$parts.partSnapshot.name' },
            partNumber: { $first: '$parts.partSnapshot.partNumber' },
          },
        },
        {
          $project: {
            partName: 1, partNumber: 1, totalQuantity: 1,
            workOrderCount: { $size: '$workOrderIds' },
          },
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 10 },
      ]),

      // 20. Vehicles with highest work order count
      WorkOrder.aggregate([
        { $match: { ...tenantQuery, createdAt: { $gte: analyticsDateFrom } } },
        {
          $lookup: {
            from: 'vehicles', localField: 'vehicle', foreignField: '_id', as: 'vehicleDoc',
          },
        },
        { $unwind: '$vehicleDoc' },
        {
          $group: {
            _id: '$vehicle',
            vehicleNo: { $first: '$vehicleDoc.vehicleNo' },
            workOrderCount: { $sum: 1 },
            totalCost: { $sum: { $ifNull: ['$totalCost', 0] } },
          },
        },
        { $sort: { workOrderCount: -1 } },
        { $limit: 10 },
      ]),

      // 21. Vehicles consuming most parts (usage intensity)
      WorkOrder.aggregate([
        { $match: { ...tenantQuery, status: WORK_ORDER_STATUS.COMPLETED, createdAt: { $gte: analyticsDateFrom } } },
        { $unwind: '$parts' },
        { $match: { 'parts.part': { $exists: true, $ne: null } } },
        {
          $lookup: {
            from: 'vehicles', localField: 'vehicle', foreignField: '_id', as: 'vehicleDoc',
          },
        },
        { $unwind: '$vehicleDoc' },
        {
          $group: {
            _id: '$vehicle',
            vehicleNo: { $first: '$vehicleDoc.vehicleNo' },
            totalPartsQty: { $sum: '$parts.quantity' },
            uniqueParts: { $addToSet: '$parts.part' },
            totalPartsCost: { $sum: '$parts.amount' },
          },
        },
        {
          $project: {
            vehicleNo: 1, totalPartsQty: 1, totalPartsCost: 1,
            uniqueParts: { $size: '$uniqueParts' },
          },
        },
        { $sort: { totalPartsQty: -1 } },
        { $limit: 10 },
      ]),

      // 22. Top parts by maintenance cost
      WorkOrder.aggregate([
        { $match: { ...tenantQuery, status: WORK_ORDER_STATUS.COMPLETED, createdAt: { $gte: analyticsDateFrom } } },
        { $unwind: '$parts' },
        { $match: { 'parts.part': { $exists: true, $ne: null } } },
        {
          $group: {
            _id: '$parts.part',
            partName: { $first: '$parts.partSnapshot.name' },
            partNumber: { $first: '$parts.partSnapshot.partNumber' },
            totalCost: { $sum: '$parts.amount' },
            totalQuantity: { $sum: '$parts.quantity' },
          },
        },
        { $sort: { totalCost: -1 } },
        { $limit: 10 },
      ]),

      // 23. Repeat failures — same part on same vehicle 2+ times
      WorkOrder.aggregate([
        { $match: { ...tenantQuery, status: WORK_ORDER_STATUS.COMPLETED, createdAt: { $gte: analyticsDateFrom } } },
        { $unwind: '$parts' },
        { $match: { 'parts.part': { $exists: true, $ne: null } } },
        {
          $lookup: {
            from: 'vehicles', localField: 'vehicle', foreignField: '_id', as: 'vehicleDoc',
          },
        },
        { $unwind: '$vehicleDoc' },
        {
          $group: {
            _id: { vehicle: '$vehicle', part: '$parts.part' },
            vehicleId: { $first: '$vehicle' },
            vehicleNo: { $first: '$vehicleDoc.vehicleNo' },
            partName: { $first: '$parts.partSnapshot.name' },
            partNumber: { $first: '$parts.partSnapshot.partNumber' },
            occurrences: { $sum: 1 },
            totalQty: { $sum: '$parts.quantity' },
          },
        },
        { $match: { occurrences: { $gte: 2 } } },
        { $sort: { occurrences: -1 } },
        { $limit: 10 },
      ]),

      // 24. Parts consumption trend (monthly, from PartTransaction)
      PartTransaction.aggregate([
        {
          $match: {
            ...tenantQuery,
            type: INVENTORY_ACTIVITY_TYPES.WORK_ORDER_ISSUE,
            createdAt: { $gte: analyticsDateFrom },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            totalQty: { $sum: { $abs: '$quantityChange' } },
            transactionCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // 25. WO priority distribution
      WorkOrder.aggregate([
        { $match: { ...tenantQuery, createdAt: { $gte: analyticsDateFrom } } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),

      // 26. Average resolution time for completed WOs
      WorkOrder.aggregate([
        {
          $match: {
            ...tenantQuery,
            status: WORK_ORDER_STATUS.COMPLETED,
            actualStartDate: { $exists: true, $ne: null },
            completedDate: { $exists: true, $ne: null },
            createdAt: { $gte: analyticsDateFrom },
          },
        },
        {
          $project: {
            resolutionMs: { $subtract: ['$completedDate', '$actualStartDate'] },
          },
        },
        { $match: { resolutionMs: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            avgMs: { $avg: '$resolutionMs' },
            minMs: { $min: '$resolutionMs' },
            maxMs: { $max: '$resolutionMs' },
            completedCount: { $sum: 1 },
          },
        },
      ]),

      // 27. Slow-moving / dead inventory — parts in stock with no WO issue in N days
      PartStock.aggregate([
        { $match: { ...tenantQuery, quantity: { $gt: 0 } } },
        { $group: { _id: '$part', totalQuantity: { $sum: '$quantity' } } },
        { $match: { totalQuantity: { $gt: 0 } } },
        {
          $lookup: {
            from: 'parttransactions',
            let: { partId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$part', '$$partId'] },
                  tenant: req.tenant,
                  type: INVENTORY_ACTIVITY_TYPES.WORK_ORDER_ISSUE,
                },
              },
              { $sort: { createdAt: -1 } },
              { $limit: 1 },
            ],
            as: 'lastIssue',
          },
        },
        {
          $lookup: {
            from: 'parts', localField: '_id', foreignField: '_id', as: 'partDoc',
          },
        },
        { $unwind: '$partDoc' },
        { $unwind: { path: '$lastIssue', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            daysSinceLastIssue: {
              $cond: {
                if: { $ifNull: ['$lastIssue.createdAt', false] },
                then: {
                  $dateDiff: { startDate: '$lastIssue.createdAt', endDate: new Date(), unit: 'day' },
                },
                else: 9999,
              },
            },
          },
        },
        { $match: { daysSinceLastIssue: { $gte: slowMovingDays } } },
        {
          $project: {
            partName: '$partDoc.name',
            partNumber: '$partDoc.partNumber',
            totalQuantity: 1,
            unitCost: '$partDoc.unitCost',
            capitalTiedUp: { $multiply: ['$totalQuantity', '$partDoc.unitCost'] },
            lastIssueDate: { $ifNull: ['$lastIssue.createdAt', null] },
            daysSinceLastIssue: 1,
          },
        },
        { $sort: { capitalTiedUp: -1 } },
        { $limit: 15 },
      ]),

      // 28. WO completion rate — monthly opened vs completed
      WorkOrder.aggregate([
        { $match: { ...tenantQuery, createdAt: { $gte: analyticsDateFrom } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            opened: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', WORK_ORDER_STATUS.COMPLETED] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Format helpers
    const formatBucket = (aggData) => {
      const output = {};
      aggData.forEach(item => { if (item._id) output[item._id] = item.count; });
      return output;
    };

    const poStatusMap = {};
    const poAmountMap = {};
    poStatusAgg.forEach(s => {
      poStatusMap[s._id] = s.count;
      poAmountMap[s._id] = s.totalAmount;
    });

    const woStatusMap = {};
    const woCostMap = {};
    woStatusAgg.forEach(s => {
      woStatusMap[s._id] = s.count;
      woCostMap[s._id] = s.totalCost;
    });

    const totalPOs = Object.values(poStatusMap).reduce((a, b) => a + b, 0);
    const totalWOs = Object.values(woStatusMap).reduce((a, b) => a + b, 0);

    const spendData = poTotalSpendAgg[0] || { totalSpend: 0, avgOrderValue: 0 };
    const inventoryValue = totalInventoryValueAgg[0]?.totalValue || 0;
    const totalStock = partStockAgg[0]?.totalQuantity || 0;
    const lowStockCount = lowStockAgg[0]?.count || 0;
    const outOfStockCount = outOfStockAgg[0]?.count || 0;

    res.status(200).json({
      // --- Parts & Inventory ---
      parts: {
        totalParts: partCount,
        totalStock,
        totalInventoryValue: inventoryValue,
        lowStockParts: lowStockCount,
        outOfStockParts: outOfStockCount,
        categoryBreakdown: partCategoryAgg.map(c => ({ category: c._id || 'Uncategorized', count: c.count })),
      },

      // --- Locations ---
      locations: {
        totalLocations: locationCount,
        stockByLocation: locationStockAgg,
      },

      // --- Purchase Orders ---
      purchaseOrders: {
        total: totalPOs,
        statusBreakdown: {
          pendingApproval: poStatusMap[PURCHASE_ORDER_STATUS.PENDING_APPROVAL] || 0,
          approved: poStatusMap[PURCHASE_ORDER_STATUS.APPROVED] || 0,
          purchased: poStatusMap[PURCHASE_ORDER_STATUS.PURCHASED] || 0,
          partialReceived: poStatusMap[PURCHASE_ORDER_STATUS.PARTIAL_RECEIVED] || 0,
          received: poStatusMap[PURCHASE_ORDER_STATUS.RECEIVED] || 0,
          rejected: poStatusMap[PURCHASE_ORDER_STATUS.REJECTED] || 0,
        },
        totalSpend: spendData.totalSpend,
        avgOrderValue: spendData.avgOrderValue,
        topVendors: topVendorAgg.map(v => ({ vendor: v.vendorName, orders: v.orderCount, spend: v.totalSpend })),
        recentOrders: recentPOs.map(po => ({
          _id: po._id,
          purchaseOrderNo: po.purchaseOrderNo,
          status: po.status,
          total: po.total,
          vendor: po.vendor?.name || '-',
          createdAt: po.createdAt,
        })),
      },

      // --- Work Orders ---
      workOrders: {
        total: totalWOs,
        statusBreakdown: {
          open: woStatusMap[WORK_ORDER_STATUS.OPEN] || 0,
          pending: woStatusMap[WORK_ORDER_STATUS.PENDING] || 0,
          completed: woStatusMap[WORK_ORDER_STATUS.COMPLETED] || 0,
        },
        totalMaintenanceCost: Object.values(woCostMap).reduce((a, b) => a + b, 0),
        categoryBreakdown: woCategoryAgg.map(c => ({ category: c._id || 'Other', count: c.count, cost: c.totalCost })),
        monthlyTrend: woMonthlyCostAgg.map(m => ({
          month: m._id,
          count: m.count,
          totalCost: m.totalCost,
          labourCost: m.labourCost,
          partsCost: m.partsCost,
        })),
        recentOrders: recentWOs.map(wo => ({
          _id: wo._id,
          workOrderNo: wo.workOrderNo,
          status: wo.status,
          category: wo.category,
          priority: wo.priority,
          totalCost: wo.totalCost,
          vehicle: wo.vehicle?.vehicleNo || '-',
          createdAt: wo.createdAt,
        })),
      },

      // --- Vendors ---
      vendors: {
        totalVendors: vendorCount,
      },

      // --- Inventory Activity (30d) ---
      recentActivity: recentTransactionAgg.map(t => ({ type: t._id, count: t.count, totalQtyChange: t.totalQtyChange })),

      // --- Analytics & Insights ---
      analytics: {
        months,
        slowMovingDays,
        topPartsUsed: topPartsUsedAgg.map(p => ({
          partId: p._id, partName: p.partName || 'Unknown', partNumber: p.partNumber || '-',
          totalQuantity: p.totalQuantity, workOrderCount: p.workOrderCount,
        })),
        vehiclesWithMostWOs: vehiclesWithMostWOsAgg.map(v => ({
          vehicleId: v._id, vehicleNo: v.vehicleNo || '-',
          workOrderCount: v.workOrderCount, totalCost: v.totalCost,
        })),
        vehiclesConsumingMostParts: vehiclesConsumingMostPartsAgg.map(v => ({
          vehicleId: v._id, vehicleNo: v.vehicleNo || '-',
          totalPartsQty: v.totalPartsQty, uniqueParts: v.uniqueParts, totalPartsCost: v.totalPartsCost,
        })),
        topPartsByCost: topPartsByCostAgg.map(p => ({
          partId: p._id, partName: p.partName || 'Unknown', partNumber: p.partNumber || '-',
          totalCost: p.totalCost, totalQuantity: p.totalQuantity,
        })),
        repeatFailures: repeatFailuresAgg.map(r => ({
          vehicleId: r.vehicleId, vehicleNo: r.vehicleNo || '-',
          partName: r.partName || 'Unknown', partNumber: r.partNumber || '-',
          occurrences: r.occurrences, totalQty: r.totalQty,
        })),
        partsConsumptionTrend: partsConsumptionTrendAgg.map(t => ({
          month: t._id, totalQty: t.totalQty, transactionCount: t.transactionCount,
        })),
        priorityDistribution: (() => {
          const map = {};
          priorityDistributionAgg.forEach(p => { if (p._id) map[p._id] = p.count; });
          return map;
        })(),
        resolutionTime: (() => {
          const msToHrs = (ms) => Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
          const raw = resolutionTimeAgg[0];
          if (!raw) return { avgHours: 0, minHours: 0, maxHours: 0, completedCount: 0 };
          return {
            avgHours: msToHrs(raw.avgMs),
            minHours: msToHrs(raw.minMs),
            maxHours: msToHrs(raw.maxMs),
            completedCount: raw.completedCount,
          };
        })(),
        slowMovingParts: slowMovingPartsAgg.map(p => ({
          partId: p._id, partName: p.partName || 'Unknown', partNumber: p.partNumber || '-',
          totalQuantity: p.totalQuantity, unitCost: p.unitCost || 0,
          capitalTiedUp: p.capitalTiedUp || 0,
          lastIssueDate: p.lastIssueDate, daysSinceLastIssue: p.daysSinceLastIssue,
        })),
        completionRate: completionRateAgg.map(m => ({
          month: m._id, opened: m.opened, completed: m.completed,
        })),
      },
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message || error });
  }
});

export {
  getTotalCounts,
  getExpiringSubtrips,
  getSubtripMonthlyData,
  getFinancialMonthlyData,
  getInvoiceStatusSummary,
  getSubtripStatusSummary,
  getCustomerMonthlyFreight,
  getMonthlySubtripExpenseSummary,
  getMonthlyMaterialWeightSummary,
  getTransporterPaymentSummary,
  getInvoiceAmountSummary,
  getMonthlyDriverSummary,
  getMonthlyTransporterSummary,
  getMonthlyVehicleSubtripSummary,
  getDailySummary,
  getVehicleDocumentStatusSummary,
  getExpiringDocuments,
  getMonthlyDestinationSubtrips,
  getTyreDashboardSummary,
  getTyreDetailedDashboard,
  getInventoryDashboardSummary,
  getWorkOrderDashboardSummary,
  getMaintenanceDashboard,
};
