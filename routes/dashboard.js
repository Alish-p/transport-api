const { Router } = require("express");
const {
    getDashboardHighlights,
    getCustomerMonthlyFreight,
    getExpiringSubtrips,
    getTotalCounts,
    getSubtripMonthlyData,
    getMonthlySubtripExpenseSummary,
    getSubtripStatusSummary,
    getLoanSchedule,
    getVehicleUtilization,
    getFinancialMonthlyData
} = require("../controllers/dashboard");

const router = Router();

router.get("/counts", getTotalCounts);
router.get("/highlights", getDashboardHighlights);
router.get("/subtrips-expiry", getExpiringSubtrips);
router.get("/subtrip-monthly-data", getSubtripMonthlyData);
router.get("/subtrip-status-summary", getSubtripStatusSummary);
router.get("/grouped/monthly-expense", getMonthlySubtripExpenseSummary);
router.get("/customer-monthly-freight", getCustomerMonthlyFreight);

router.get("/financial-monthly-data", getFinancialMonthlyData);
router.get("/loan-schedule", getLoanSchedule);
router.get("/vehicle-utilization", getVehicleUtilization);

module.exports = router;
