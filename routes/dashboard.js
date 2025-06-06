const { Router } = require("express");
const { getDashboardSummary, getDashboardHighlights, getCustomerMonthlyFreight } = require("../controllers/dashboard");

const router = Router();

router.get("/summary", getDashboardSummary);
router.get("/highlights", getDashboardHighlights);
router.get("/customer-monthly-freight", getCustomerMonthlyFreight);

module.exports = router;
