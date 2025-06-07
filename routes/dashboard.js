const { Router } = require("express");
const {
    getDashboardSummary,
    getDashboardHighlights,
    getCustomerMonthlyFreight,
    getExpiringSubtrips,
    getTotalCounts,
    getSubtripMonthlyData,
    getMonthlySubtripExpenseSummary
} = require("../controllers/dashboard");

const router = Router();

router.get("/counts", getTotalCounts);
router.get("/summary", getDashboardSummary);
router.get("/highlights", getDashboardHighlights);
router.get("/subtrips-expiry", getExpiringSubtrips);
router.get("/subtrip-monthly-data", getSubtripMonthlyData);
router.get("/grouped/monthly-expense", getMonthlySubtripExpenseSummary);
router.get("/customer-monthly-freight", getCustomerMonthlyFreight);

module.exports = router;
