import Loan from '../loan/loan.model.js';
import Driver from '../driver/driver.model.js';
import asyncHandler from 'express-async-handler';
import Vehicle from '../vehicle/vehicle.model.js';
import Invoice from '../invoice/invoice.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Expense from '../expense/expense.model.js';
import Customer from '../customer/customer.model.js';
import Transporter from '../transporter/transporter.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import DriverSalary from '../driverSalary/driverSalary.model.js';
import { INVOICE_STATUS } from '../invoice/invoice.constants.js';
import { SUBTRIP_STATUS } from '../subtrip/subtrip.constants.js';
import { EXPENSE_CATEGORIES } from '../expense/expense.constants.js';
import { calculateDriverSalary } from '../driverSalary/driverSalary.utils.js';
import TransporterPayment from '../transporterPayment/transporterPayment.model.js';
import { calculateTransporterPayment } from '../transporterPayment/transporterPayment.utils.js';



// Get basic entity counts
const getTotalCounts = asyncHandler(async (req, res) => {
  const [
    vehicleCount,
    driverCount,
    transporterCount,
    customerCount,
    invoiceCount,
    subtripCount,
    transporterSubtrips,
    salarySubtrips,
  ] = await Promise.all([
    Vehicle.countDocuments(addTenantToQuery(req)),
    Driver.countDocuments(addTenantToQuery(req)),
    Transporter.countDocuments(addTenantToQuery(req)),
    Customer.countDocuments(addTenantToQuery(req)),
    Invoice.countDocuments(addTenantToQuery(req)),
    Subtrip.countDocuments(addTenantToQuery(req)),
    Subtrip.find(
      addTenantToQuery(req, {
        subtripStatus: SUBTRIP_STATUS.RECEIVED,
        transporterPaymentReceiptId: { $exists: false },
      })
    )
      .populate({
        path: "tripId",
        populate: { path: "vehicleId", select: "isOwn" },
      })
      .populate("expenses")
      .lean(),
    Subtrip.find(
      addTenantToQuery(req, {
        subtripStatus: SUBTRIP_STATUS.RECEIVED,
        driverSalaryReceiptId: { $exists: false },
      })
    )
      .populate({
        path: "tripId",
        populate: { path: "vehicleId", select: "isOwn" },
      })
      .populate("expenses")
      .lean(),
  ]);

  let totalPendingTransporterPayment = 0;
  transporterSubtrips.forEach((st) => {
    if (st.tripId?.vehicleId && !st.tripId.vehicleId.isOwn) {
      const { totalTransporterPayment } = calculateTransporterPayment(st);
      totalPendingTransporterPayment += totalTransporterPayment;
    }
  });

  let totalPendingSalary = 0;
  salarySubtrips.forEach((st) => {
    if (st.tripId?.vehicleId && st.tripId.vehicleId.isOwn) {
      totalPendingSalary += calculateDriverSalary(st);
    }
  });

  res.status(200).json({
    vehicles: vehicleCount,
    drivers: driverCount,
    transporters: transporterCount,
    customers: customerCount,
    invoices: invoiceCount,
    subtrips: subtripCount,
    totalPendingTransporterPayment,
    totalPendingSalary,
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

  const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNum, 1));

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

// Get subtrips whose eway bill is expired or about to expire
const getExpiringSubtrips = asyncHandler(async (req, res) => {
  const daysParam = parseInt(req.query.days, 10);
  const days = Number.isNaN(daysParam) ? 1 : daysParam;

  const now = new Date();
  const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const subtrips = await Subtrip.find(
    addTenantToQuery(req, {
      subtripStatus: SUBTRIP_STATUS.LOADED,
      ewayExpiryDate: { $ne: null, $lte: threshold },
    })
  )
    .select("_id startDate unloadingPoint ewayExpiryDate tripId customerId")
    .populate({
      path: "tripId",
      select: "vehicleId",
      populate: { path: "vehicleId", select: "vehicleNo" },
    })
    .populate({ path: "customerId", select: "customerName" })
    .sort({ ewayExpiryDate: 1 })
    .lean();

  const formatted = subtrips.map((st) => ({
    subtripId: st._id,
    vehicle: st.tripId?.vehicleId?.vehicleNo || null,
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

  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const endOfYear = new Date(Date.UTC(year + 1, 0, 1));

  try {
    const results = await Subtrip.aggregate([
      {
        $match: {
          tenant: req.tenant,
          startDate: { $gte: startOfYear, $lt: endOfYear },
          isEmpty: false,
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
      { $unwind: "$trip" },
      {
        $lookup: {
          from: "vehicles",
          localField: "trip.vehicleId",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      { $unwind: "$vehicle" },
      {
        $group: {
          _id: { month: { $month: "$startDate" }, isOwn: "$vehicle.isOwn" },
          count: { $sum: 1 },
        },
      },
    ]);

    const own = Array(12).fill(0);
    const market = Array(12).fill(0);

    results.forEach((r) => {
      const monthIndex = r._id.month - 1; // $month is 1-indexed
      if (r._id.isOwn) own[monthIndex] = r.count;
      else market[monthIndex] = r.count;
    });

    res.status(200).json({ year, own, market });
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

  const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNum, 1));

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

  const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNum, 1));

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

// Get top 10 routes by number of associated subtrips
const getTopRoutes = asyncHandler(async (req, res) => {
  try {
    const results = await Subtrip.aggregate([
      { $match: { tenant: req.tenant, routeCd: { $ne: null } } },
      {
        $lookup: {
          from: "trips",
          localField: "tripId",
          foreignField: "_id",
          as: "trip",
        },
      },
      { $unwind: "$trip" },
      {
        $lookup: {
          from: "vehicles",
          localField: "trip.vehicleId",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      { $unwind: "$vehicle" },
      {
        $group: {
          _id: "$routeCd",
          subtripCount: { $sum: 1 },
          ownSubtripCount: { $sum: { $cond: ["$vehicle.isOwn", 1, 0] } },
          marketSubtripCount: { $sum: { $cond: ["$vehicle.isOwn", 0, 1] } },
        },
      },
      { $sort: { subtripCount: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "routes",
          localField: "_id",
          foreignField: "_id",
          as: "route",
        },
      },
      { $unwind: "$route" },
      {
        $project: {
          _id: 0,
          routeId: "$_id",
          routeName: "$route.routeName",
          fromPlace: "$route.fromPlace",
          toPlace: "$route.toPlace",
          subtripCount: 1,
          ownSubtripCount: 1,
          marketSubtripCount: 1,
        },
      },
    ]);

    res.status(200).json(results);
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

  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const endOfYear = new Date(Date.UTC(year + 1, 0, 1));

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
            _id: { month: { $month: "$issueDate" } },
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
            _id: { month: { $month: "$issueDate" } },
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
            _id: { month: { $month: "$issueDate" } },
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
            _id: { month: { $month: "$disbursementDate" } },
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
const getTransporterPaymentTotals = asyncHandler(async (req, res) => {
  try {
    const [generatedAgg, paidAgg, pendingSubtrips] = await Promise.all([
      TransporterPayment.aggregate([
        { $match: { tenant: req.tenant, status: "generated" } },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$summary.netIncome", 0] } },
          },
        },
      ]),
      TransporterPayment.aggregate([
        { $match: { tenant: req.tenant, status: "paid" } },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$summary.netIncome", 0] } },
          },
        },
      ]),
      Subtrip.find(
        addTenantToQuery(req, {
          subtripStatus: SUBTRIP_STATUS.RECEIVED,
          transporterPaymentReceiptId: { $exists: false },
        })
      )
        .populate({
          path: "tripId",
          populate: { path: "vehicleId", select: "isOwn" },
        })
        .populate("expenses")
        .lean(),
    ]);

    let yetToCreateAmount = 0;
    pendingSubtrips.forEach((st) => {
      if (st.tripId?.vehicleId && !st.tripId.vehicleId.isOwn) {
        const { totalTransporterPayment } = calculateTransporterPayment(st);
        yetToCreateAmount += totalTransporterPayment;
      }
    });

    const generatedAmount = generatedAgg[0]?.total || 0;
    const paidAmount = paidAgg[0]?.total || 0;

    res.status(200).json({
      generatedAmount,
      paidAmount,
      yetToCreateAmount,
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
      }).select(
        "_id invoiceNo issueDate dueDate netTotal totalReceived invoiceStatus"
      ),
      Invoice.find({
        tenant: req.tenant,
        invoiceStatus: {
          $in: [INVOICE_STATUS.RECEIVED, INVOICE_STATUS.PARTIAL_RECEIVED],
        },
      }).select(
        "_id invoiceNo issueDate dueDate netTotal totalReceived invoiceStatus"
      ),
      Subtrip.find({
        tenant: req.tenant,
        $or: [{ invoiceId: { $exists: false } }, { invoiceId: null }],
        subtripStatus: SUBTRIP_STATUS.RECEIVED,
      }).select(
        "_id customerId loadingPoint unloadingPoint startDate loadingWeight rate"
      ),
    ]);

    const pendingAmount = pendingAgg[0]?.total || 0;
    const receivedAmount = receivedAgg[0]?.total || 0;
    const unbilledAmount = unbilledAgg[0]?.total || 0;

    res.status(200).json({
      pendingAmount,
      pendingInvoices,
      receivedAmount,
      receivedInvoices,
      unbilledAmount,
      unbilledSubtrips,
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

  const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNum, 1));

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
          from: "trips",
          localField: "tripId",
          foreignField: "_id",
          as: "trip",
        },
      },
      { $unwind: "$trip" },
      {
        $lookup: {
          from: "vehicles",
          localField: "trip.vehicleId",
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
        $addFields: {
          distance: {
            $cond: [
              {
                $and: [{ $ne: ["$startKm", null] }, { $ne: ["$endKm", null] }],
              },
              { $abs: { $subtract: ["$endKm", "$startKm"] } },
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
                    cond: { $eq: ["$$e.expenseType", "diesel"] },
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
          _id: "$vehicle._id",
          vehicleNo: { $first: "$vehicle.vehicleNo" },
          subtripCount: { $sum: 1 },
          totalLoadingWeight: { $sum: { $ifNull: ["$loadingWeight", 0] } },
          totalKm: { $sum: "$distance" },
          totalDiesel: { $sum: "$dieselUsed" },
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

  const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNum, 1));

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
          from: "trips",
          localField: "tripId",
          foreignField: "_id",
          as: "trip",
        },
      },
      { $unwind: "$trip" },
      {
        $lookup: {
          from: "vehicles",
          localField: "trip.vehicleId",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      { $unwind: "$vehicle" },
      { $match: { "vehicle.isOwn": true } },
      {
        $lookup: {
          from: "drivers",
          localField: "trip.driverId",
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

  const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNum, 1));

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
          from: "trips",
          localField: "tripId",
          foreignField: "_id",
          as: "trip",
        },
      },
      { $unwind: "$trip" },
      {
        $lookup: {
          from: "vehicles",
          localField: "trip.vehicleId",
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
        },
      },
      {
        $group: {
          _id: "$_id.transporterId",
          transporterName: { $first: "$transporterName" },
          subtripCount: { $sum: "$subtripCount" },
          totalLoadingWeight: { $sum: "$totalLoadingWeight" },
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

export {
  getTotalCounts,
  getExpiringSubtrips,
  getSubtripMonthlyData,
  getFinancialMonthlyData,
  getInvoiceStatusSummary,
  getTopRoutes,
  getSubtripStatusSummary,
  getCustomerMonthlyFreight,
  getMonthlySubtripExpenseSummary,
  getMonthlyMaterialWeightSummary,
  getTransporterPaymentTotals,
  getInvoiceAmountSummary,
  getMonthlyDriverSummary,
  getMonthlyTransporterSummary,
  getMonthlyVehicleSubtripSummary,
};
