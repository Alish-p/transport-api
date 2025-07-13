const { Router } = require("express");
const {
    getDashboardHighlights,
    getCustomerMonthlyFreight,
    getExpiringSubtrips,
    getTotalCounts,
    getSubtripMonthlyData,
    getMonthlySubtripExpenseSummary,
    getMonthlyMaterialWeightSummary,
    getSubtripStatusSummary,
    getLoanSchedule,
    getVehicleUtilization,
    getFinancialMonthlyData,
    getInvoiceStatusSummary,
    getTopRoutes,
    getTransporterPaymentTotals,
    getInvoiceAmountSummary
} = require("../controllers/dashboard");

const router = Router();


router.get("/counts", getTotalCounts);
router.get("/loan-schedule", getLoanSchedule);
router.get("/highlights", getDashboardHighlights);
router.get("/subtrips-expiry", getExpiringSubtrips);
router.get("/vehicle-utilization", getVehicleUtilization);
router.get("/subtrip-monthly-data", getSubtripMonthlyData);
router.get("/subtrip-status-summary", getSubtripStatusSummary);
router.get("/invoice-status-summary", getInvoiceStatusSummary);
router.get("/financial-monthly-data", getFinancialMonthlyData);
router.get("/customer-monthly-freight", getCustomerMonthlyFreight);
router.get("/top-routes", getTopRoutes);
router.get("/grouped/monthly-expense", getMonthlySubtripExpenseSummary);
router.get("/grouped/monthly-material-weight", getMonthlyMaterialWeightSummary);
router.get("/invoice-amount-summary", getInvoiceAmountSummary);
router.get("/transporter-payment-summary", getTransporterPaymentTotals);

module.exports = router;
