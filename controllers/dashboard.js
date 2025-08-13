const asyncHandler = require("express-async-handler");
const Driver = require("../model/Driver");
const Transporter = require("../model/Transporter");
const Customer = require("../model/Customer");
const Vehicle = require("../model/Vehicle");
const Invoice = require("../model/Invoice");
const DriverSalary = require("../model/DriverSalary");
const TransporterPayment = require("../model/TransporterPayment");
const Trip = require("../model/Trip");
const Subtrip = require("../model/Subtrip");
const Expense = require("../model/Expense");
const Loan = require("../model/Loan");
const { EXPENSE_CATEGORIES } = require("../constants/status");
const { addTenantToQuery } = require("../Utils/tenant-utils");

const { SUBTRIP_STATUS, INVOICE_STATUS } = require("../constants/status");
const {
  calculateTransporterPayment,
} = require("../Utils/transporter-payment-utils");
const { calculateDriverSalary } = require("../Utils/driver-salary-utils");

// Get Dashboard Highlights
const getDashboardHighlights = asyncHandler(async (req, res) => {
  try {
    const tenantMatch = { tenant: req.tenant };

    const weightByCustomerPromise = Subtrip.aggregate([
      { $match: { ...tenantMatch, customerId: { $ne: null } } },
      {
        $group: {
          _id: "$customerId",
          totalWeight: { $sum: { $ifNull: ["$loadingWeight", 0] } },
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
          totalWeight: 1,
        },
      },
    ]);

    const paymentsByCustomerPromise = Invoice.aggregate([
      { $match: tenantMatch },
      {
        $group: {
          _id: "$customerId",
          totalAmount: { $sum: { $ifNull: ["$netTotal", 0] } },
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
          totalAmount: 1,
        },
      },
    ]);

    const vehicleTonnagePromise = Subtrip.aggregate([
      { $match: tenantMatch },
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
          _id: "$vehicle.isOwn",
          totalWeight: { $sum: { $ifNull: ["$loadingWeight", 0] } },
        },
      },
    ]);

    const loanAggPromise = Loan.aggregate([
      { $match: tenantMatch },
      {
        $group: {
          _id: null,
          totalGiven: { $sum: { $ifNull: ["$principalAmount", 0] } },
          outstanding: { $sum: { $ifNull: ["$outstandingBalance", 0] } },
        },
      },
    ]);

    const [
      inQueueCount,
      loadedCount,
      errorCount,
      receivedCount,
      billedCount,
      totalVehicles,
      totalDrivers,
      totalCustomers,
      pendingInvoices,
      overdueInvoices,
      paidInvoices,
      weightByCustomer,
      paymentsByCustomer,
      vehicleTonnageAgg,
      loanAgg,
    ] = await Promise.all([
      Subtrip.countDocuments(
        addTenantToQuery(req, { subtripStatus: SUBTRIP_STATUS.IN_QUEUE })
      ),
      Subtrip.countDocuments(
        addTenantToQuery(req, { subtripStatus: SUBTRIP_STATUS.LOADED })
      ),
      Subtrip.countDocuments(
        addTenantToQuery(req, { subtripStatus: SUBTRIP_STATUS.ERROR })
      ),
      Subtrip.countDocuments(
        addTenantToQuery(req, { subtripStatus: SUBTRIP_STATUS.RECEIVED })
      ),
      Subtrip.countDocuments(
        addTenantToQuery(req, { subtripStatus: SUBTRIP_STATUS.BILLED })
      ),
      Vehicle.countDocuments(addTenantToQuery(req)),
      Driver.countDocuments(addTenantToQuery(req)),
      Customer.countDocuments(addTenantToQuery(req)),
      Invoice.countDocuments(
        addTenantToQuery(req, { invoiceStatus: INVOICE_STATUS.PENDING })
      ),
      Invoice.countDocuments(
        addTenantToQuery(req, { invoiceStatus: INVOICE_STATUS.OVERDUE })
      ),
      Invoice.countDocuments(
        addTenantToQuery(req, { invoiceStatus: INVOICE_STATUS.RECEIVED })
      ),
      weightByCustomerPromise,
      paymentsByCustomerPromise,
      vehicleTonnagePromise,
      loanAggPromise,
    ]);

    const vehicleTonnage = vehicleTonnageAgg.reduce(
      (acc, cur) => {
        if (cur._id) acc.own = cur.totalWeight;
        else acc.market = cur.totalWeight;
        return acc;
      },
      { own: 0, market: 0 }
    );

    const loans = loanAgg[0] || { totalGiven: 0, outstanding: 0 };

    res.status(200).json({
      subtripStatus: {
        inQueue: inQueueCount,
        loaded: loadedCount,
        error: errorCount,
        received: receivedCount,
        billed: billedCount,
      },
      customerTonnage: weightByCustomer,
      customerPayments: paymentsByCustomer,
      vehicleTonnage,
      loans,
      totals: {
        vehicles: totalVehicles,
        drivers: totalDrivers,
        customers: totalCustomers,
        invoices: {
          pending: pendingInvoices,
          overdue: overdueInvoices,
          paid: paidInvoices,
        },
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
});

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

// Get total EMI amounts due by month and overall loan totals
const getLoanSchedule = asyncHandler(async (req, res) => {
  const yearParam = parseInt(req.query.year, 10);
  const year = Number.isNaN(yearParam)
    ? new Date().getUTCFullYear()
    : yearParam;

  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const endOfYear = new Date(Date.UTC(year + 1, 0, 1));

  try {
    const monthlyAgg = await Loan.aggregate([
      { $match: { tenant: req.tenant } },
      { $unwind: "$installments" },
      {
        $match: {
          "installments.status": "pending",
          "installments.dueDate": { $gte: startOfYear, $lt: endOfYear },
        },
      },
      {
        $group: {
          _id: { month: { $month: "$installments.dueDate" } },
          totalEmi: { $sum: "$installments.totalDue" },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);

    const schedule = Array(12).fill(0);
    monthlyAgg.forEach((r) => {
      schedule[r._id.month - 1] = r.totalEmi;
    });

    const loanTotalsAgg = await Loan.aggregate([
      { $match: { tenant: req.tenant } },
      {
        $group: {
          _id: null,
          totalGiven: { $sum: { $ifNull: ["$principalAmount", 0] } },
          outstanding: { $sum: { $ifNull: ["$outstandingBalance", 0] } },
        },
      },
    ]);

    const totals = loanTotalsAgg[0] || { totalGiven: 0, outstanding: 0 };

    res.status(200).json({ year, schedule, totals });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
});

// Get overall vehicle utilization and empty trip distance for a year
const getVehicleUtilization = asyncHandler(async (req, res) => {
  const yearParam = parseInt(req.query.year, 10);
  const year = Number.isNaN(yearParam)
    ? new Date().getUTCFullYear()
    : yearParam;

  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const endOfYear = new Date(Date.UTC(year + 1, 0, 1));
  const daysInYear = (endOfYear - startOfYear) / (1000 * 60 * 60 * 24);

  try {
    const [vehicleCount, trips, distanceAgg] = await Promise.all([
      Vehicle.countDocuments(addTenantToQuery(req)),
      Trip.find(
        addTenantToQuery(req, {
          fromDate: { $lt: endOfYear },
          $or: [{ toDate: { $gte: startOfYear } }, { toDate: null }],
        })
      ).lean(),
      Subtrip.aggregate([
        { $match: { tenant: req.tenant } },
        {
          $match: {
            startDate: { $gte: startOfYear, $lt: endOfYear },
            startKm: { $ne: null },
            endKm: { $ne: null },
          },
        },
        {
          $group: {
            _id: "$isEmpty",
            distance: { $sum: { $abs: { $subtract: ["$endKm", "$startKm"] } } },
          },
        },
      ]),
    ]);

    let totalTripDays = 0;
    trips.forEach((t) => {
      const start = t.fromDate > startOfYear ? t.fromDate : startOfYear;
      const end = t.toDate && t.toDate < endOfYear ? t.toDate : endOfYear;
      const diff = (end - start) / (1000 * 60 * 60 * 24);
      if (diff > 0) totalTripDays += diff;
    });

    const utilization =
      vehicleCount && daysInYear
        ? (totalTripDays / (vehicleCount * daysInYear)) * 100
        : 0;

    let totalKm = 0;
    let emptyKm = 0;
    distanceAgg.forEach((d) => {
      totalKm += d.distance || 0;
      if (d._id) emptyKm += d.distance || 0;
    });

    const emptyPercent = totalKm ? (emptyKm / totalKm) * 100 : 0;

    res.status(200).json({
      year,
      utilization: Math.round(utilization * 100) / 100,
      distance: {
        total: totalKm,
        empty: emptyKm,
        emptyPercent: Math.round(emptyPercent * 100) / 100,
      },
    });
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
      { label: "RECEIVED", value: statusMap[INVOICE_STATUS.RECEIVED] },
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
    const [generatedAgg, receivedAgg, pendingAgg] = await Promise.all([
      Invoice.aggregate([
        {
          $match: {
            tenant: req.tenant,
            invoiceStatus: {
              $in: [INVOICE_STATUS.PENDING, INVOICE_STATUS.OVERDUE],
            },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$netTotal", 0] } },
          },
        },
      ]),
      Invoice.aggregate([
        {
          $match: {
            tenant: req.tenant,
            invoiceStatus: INVOICE_STATUS.RECEIVED,
          },
        },
        {
          $group: { _id: null, total: { $sum: { $ifNull: ["$netTotal", 0] } } },
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
    ]);

    const generatedAmount = generatedAgg[0]?.total || 0;
    const receivedAmount = receivedAgg[0]?.total || 0;
    const pendingAmount = pendingAgg[0]?.total || 0;

    res.status(200).json({ generatedAmount, receivedAmount, pendingAmount });
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

module.exports = {
  getTotalCounts,
  getLoanSchedule,
  getExpiringSubtrips,
  getVehicleUtilization,
  getSubtripMonthlyData,
  getDashboardHighlights,
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
