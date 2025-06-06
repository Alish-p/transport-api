const asyncHandler = require("express-async-handler");
const Driver = require("../model/Driver");
const Transporter = require("../model/Transporter");
const Customer = require("../model/Customer");
const Vehicle = require("../model/Vehicle");
const Invoice = require("../model/Invoice");
const Pump = require("../model/Pump");
const Route = require("../model/Route");
const DriverSalary = require("../model/DriverSalary");
const Trip = require("../model/Trip");
const Subtrip = require("../model/Subtrip");
const Expense = require("../model/Expense");
const Loan = require("../model/Loan");

const { SUBTRIP_STATUS, INVOICE_STATUS } = require("../constants/status");

// Get Dashboard Summary
const getDashboardSummary = asyncHandler(async (req, res) => {
  try {
    const today = new Date();

    // Fetch all required counts concurrently
    const [
      totalDrivers,
      activeDrivers,
      inactiveDrivers,
      expiredDrivers,

      totalVehicles,
      activeVehicles,
      ownedVehicles,
      notOwnedVehicles,

      totalInvoices,
      pendingInvoicesCount,
      paidInvoicesCount,
      overdueInvoicesCount,
      totalPendingInvoiceAmount,

      totalTransporters,
      activeTransporters,

      totalPumps,
      activePumps,

      totalCustomers,
      activeCustomers,

      totalRoutes,
      customerSpecificRoutes,
      genericRoutes,

      totalDriverSalaries,
      pendingDriverSalaries,
      paidDriverSalaries,

      totalTrips,
      pendingTrips,
      billedTrips,

      totalSubtrips,
      inqueueSubtrips,
      loadedSubtrips,
      recievedSubtrips,
      errorSubtrips,
      billedSubtrips,

      totalExpenses,
      vehicleExpenses,
      subtripExpenses,
    ] = await Promise.all([
      // Driver Statistics
      Driver.countDocuments(),
      Driver.countDocuments({ isActive: true }),
      Driver.countDocuments({ isActive: false }),
      Driver.countDocuments({ licenseTo: { $lt: today } }),

      // Vehicle Statistics
      Vehicle.countDocuments(),
      Vehicle.countDocuments({ isActive: true }),
      Vehicle.countDocuments({ isOwn: true }),
      Vehicle.countDocuments({ isOwn: false }),

      // Invoice Statistics
      Invoice.countDocuments(),
      Invoice.countDocuments({ invoiceStatus: "pending" }),
      Invoice.countDocuments({ invoiceStatus: "paid" }),
      Invoice.countDocuments({ invoiceStatus: "overdue" }),
      Invoice.aggregate([
        { $match: { invoiceStatus: "pending" } },
        { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
      ]).then((result) => (result.length ? result[0].totalAmount : 0)),

      // Transporter Statistics
      Transporter.countDocuments(),
      Transporter.countDocuments({ isActive: true }),

      // Pump Statistics
      Pump.countDocuments(),
      Pump.countDocuments({ isActive: true }),

      // Customer Statistics
      Customer.countDocuments(),
      Customer.countDocuments({ isActive: true }),

      // Route Statistics
      Route.countDocuments(),
      Route.countDocuments({ isCustomerSpecific: true }),
      Route.countDocuments({ isCustomerSpecific: false }),

      // DriverSalary Statistics
      DriverSalary.countDocuments(),
      DriverSalary.countDocuments({ status: "pending" }),
      DriverSalary.countDocuments({ status: "paid" }),

      // Trip Statistics
      Trip.countDocuments(),
      Trip.countDocuments({ tripStatus: "pending" }),
      Trip.countDocuments({ tripStatus: "billed" }),

      // Subtrip Statistics
      Subtrip.countDocuments(),
      Subtrip.countDocuments({ subtripStatus: "in-queue" }),
      Subtrip.countDocuments({ subtripStatus: "loaded" }),
      Subtrip.countDocuments({ subtripStatus: "received" }),
      Subtrip.countDocuments({ subtripStatus: "error" }),
      Subtrip.countDocuments({ subtripStatus: "billed" }),

      // Expense Statistics
      Expense.countDocuments(),
      Expense.countDocuments({ expenseCategory: "vehicle" }),
      Expense.countDocuments({ expenseCategory: "subtrip" }),
    ]);

    res.status(200).json({
      drivers: {
        total: totalDrivers,
        active: activeDrivers,
        inactive: inactiveDrivers,
        expired: expiredDrivers,
      },
      vehicles: {
        total: totalVehicles,
        active: activeVehicles,
        owned: ownedVehicles,
        notOwned: notOwnedVehicles,
      },

      invoices: {
        total: totalInvoices,
        pending: pendingInvoicesCount,
        paid: paidInvoicesCount,
        overdue: overdueInvoicesCount,
        totalPendingAmount: totalPendingInvoiceAmount,
      },

      transporters: {
        total: totalTransporters,
        active: activeTransporters,
      },

      pumps: {
        total: totalPumps,
        active: activePumps,
      },

      customers: {
        total: totalCustomers,
        active: activeCustomers,
      },

      routes: {
        total: totalRoutes,
        customerSpecificRoutes,
        genericRoutes,
      },

      driverSalaries: {
        total: totalDriverSalaries,
        pending: pendingDriverSalaries,
        paid: paidDriverSalaries,
      },

      trips: {
        total: totalTrips,
        pending: pendingTrips,
        billed: billedTrips,
      },

      subtrips: {
        total: totalSubtrips,
        inqueue: inqueueSubtrips,
        loaded: loadedSubtrips,
        received: recievedSubtrips,
        error: errorSubtrips,
        billed: billedSubtrips,
      },

      expenses: {
        total: totalExpenses,
        vehicle: vehicleExpenses,
        subtrip: subtripExpenses,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error });
  }
});

// Get Dashboard Highlights
const getDashboardHighlights = asyncHandler(async (req, res) => {
  try {
    const weightByCustomerPromise = Subtrip.aggregate([
      { $match: { customerId: { $ne: null } } },
      { $group: { _id: "$customerId", totalWeight: { $sum: { $ifNull: ["$loadingWeight", 0] } } } },
      { $lookup: { from: "customers", localField: "_id", foreignField: "_id", as: "customer" } },
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
      {
        $group: {
          _id: "$customerId",
          totalAmount: { $sum: { $ifNull: ["$totalAfterTax", 0] } },
        },
      },
      { $lookup: { from: "customers", localField: "_id", foreignField: "_id", as: "customer" } },
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
      { $lookup: { from: "trips", localField: "tripId", foreignField: "_id", as: "trip" } },
      { $unwind: "$trip" },
      { $lookup: { from: "vehicles", localField: "trip.vehicleId", foreignField: "_id", as: "vehicle" } },
      { $unwind: "$vehicle" },
      {
        $group: {
          _id: "$vehicle.isOwn",
          totalWeight: { $sum: { $ifNull: ["$loadingWeight", 0] } },
        },
      },
    ]);

    const loanAggPromise = Loan.aggregate([
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
      billedPendingCount,
      billedOverdueCount,
      billedPaidCount,
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
      Subtrip.countDocuments({ subtripStatus: SUBTRIP_STATUS.IN_QUEUE }),
      Subtrip.countDocuments({ subtripStatus: SUBTRIP_STATUS.LOADED }),
      Subtrip.countDocuments({ subtripStatus: SUBTRIP_STATUS.ERROR }),
      Subtrip.countDocuments({ subtripStatus: SUBTRIP_STATUS.RECEIVED }),
      Subtrip.countDocuments({ subtripStatus: SUBTRIP_STATUS.BILLED_PENDING }),
      Subtrip.countDocuments({ subtripStatus: SUBTRIP_STATUS.BILLED_OVERDUE }),
      Subtrip.countDocuments({ subtripStatus: SUBTRIP_STATUS.BILLED_PAID }),
      Vehicle.countDocuments(),
      Driver.countDocuments(),
      Customer.countDocuments(),
      Invoice.countDocuments({ invoiceStatus: INVOICE_STATUS.PENDING }),
      Invoice.countDocuments({ invoiceStatus: INVOICE_STATUS.OVERDUE }),
      Invoice.countDocuments({ invoiceStatus: INVOICE_STATUS.PAID }),
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
        billed: {
          pending: billedPendingCount,
          overdue: billedOverdueCount,
          paid: billedPaidCount,
        },
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

// Get customer-wise total weight and freight for a month
const getCustomerMonthlyFreight = asyncHandler(async (req, res) => {
  const { month } = req.query;

  if (!month) {
    return res
      .status(400)
      .json({ message: 'Month query parameter required in YYYY-MM format' });
  }

  const [yearStr, monthStr] = month.split('-');
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
      .json({ message: 'Invalid month format. Use YYYY-MM' });
  }

  const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNum, 1));

  try {
    const results = await Subtrip.aggregate([
      {
        $match: {
          customerId: { $ne: null },
          subtripStatus: { $ne: SUBTRIP_STATUS.IN_QUEUE },
          startDate: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: '$customerId',
          totalLoadingWeight: { $sum: { $ifNull: ['$loadingWeight', 0] } },
          totalFreightAmount: {
            $sum: {
              $multiply: [
                { $ifNull: ['$loadingWeight', 0] },
                { $ifNull: ['$rate', 0] },
              ],
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
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: '$customer' },
      {
        $project: {
          _id: 0,
          customerId: '$_id',
          customerName: '$customer.customerName',
          totalLoadingWeight: 1,
          totalFreightAmount: 1,
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
  const days = Number.isNaN(daysParam) ? 3 : daysParam;

  const now = new Date();
  const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const subtrips = await Subtrip.find({
    subtripStatus: SUBTRIP_STATUS.LOADED,
    ewayExpiryDate: { $ne: null, $lte: threshold },
  })
    .select(
      "_id startDate unloadingPoint ewayExpiryDate tripId customerId"
    )
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
    ewayExpiryDate: st.ewayExpiryDate
  }));

  res.status(200).json(formatted);
});




module.exports = {
  getExpiringSubtrips,
  getDashboardSummary,
  getDashboardHighlights,
  getCustomerMonthlyFreight
};
