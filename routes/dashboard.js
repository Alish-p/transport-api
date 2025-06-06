const { Router } = require("express");
const { getDashboardSummary, getDashboardHighlights, getCustomerMonthlyFreight, getExpiringSubtrips } = require("../controllers/dashboard");

const router = Router();

router.get("/summary", getDashboardSummary);
router.get("/highlights", getDashboardHighlights);
router.get("/subtrips-expiry", getExpiringSubtrips);
router.get("/customer-monthly-freight", getCustomerMonthlyFreight);

module.exports = router;
