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
      closedSubtrips,
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
      Subtrip.countDocuments({ subtripStatus: "closed" }),
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
        customerSpecificRoutes: customerSpecificRoutes,
        genericRoutes: genericRoutes,
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
        closed: closedSubtrips,
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
    res.status(500).json({ error: error });
  }
});

module.exports = {
  getDashboardSummary,
};
