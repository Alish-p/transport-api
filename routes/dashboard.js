const { Router } = require("express");
const {
  getDashboardHighlights,
  getCustomerMonthlyFreight,
  getExpiringSubtrips,
  getTotalCounts,
  getSubtripMonthlyData,
  getMonthlySubtripExpenseSummary,
  getMonthlyMaterialWeightSummary,
  getMonthlyVehicleSubtripSummary,
  getMonthlyDriverSummary,
  getMonthlyTransporterSummary,
  getSubtripStatusSummary,
  getLoanSchedule,
  getVehicleUtilization,
  getFinancialMonthlyData,
  getInvoiceStatusSummary,
  getTopRoutes,
  getTransporterPaymentTotals,
  getInvoiceAmountSummary,
} = require("../controllers/dashboard");

const { private } = require("../middlewares/Auth");

const router = Router();

router.get("/counts", private, getTotalCounts);
router.get("/loan-schedule", private, getLoanSchedule);
router.get("/highlights", private, getDashboardHighlights);
router.get("/subtrips-expiry", private, getExpiringSubtrips);
router.get("/vehicle-utilization", private, getVehicleUtilization);
router.get("/subtrip-monthly-data", private, getSubtripMonthlyData);
router.get("/subtrip-status-summary", private, getSubtripStatusSummary);
router.get("/invoice-status-summary", private, getInvoiceStatusSummary);
router.get("/financial-monthly-data", private, getFinancialMonthlyData);
router.get("/customer-monthly-freight", private, getCustomerMonthlyFreight);
router.get("/top-routes", private, getTopRoutes);
router.get(
  "/grouped/monthly-expense",
  private,
  getMonthlySubtripExpenseSummary
);
router.get(
  "/grouped/monthly-material-weight",
  private,
  getMonthlyMaterialWeightSummary
);
router.get(
  "/grouped/monthly-vehicle-subtrips",
  private,
  getMonthlyVehicleSubtripSummary
);
router.get(
  "/grouped/monthly-driver-subtrips",
  private,
  getMonthlyDriverSummary
);
router.get(
  "/grouped/monthly-transporter-subtrips",
  private,
  getMonthlyTransporterSummary
);
router.get("/invoice-amount-summary", private, getInvoiceAmountSummary);
router.get(
  "/transporter-payment-summary",
  private,
  getTransporterPaymentTotals
);

module.exports = router;
