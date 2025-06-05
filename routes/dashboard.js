const { Router } = require("express");
const { getDashboardSummary, getDashboardHighlights } = require("../controllers/dashboard");

const router = Router();

router.get("/summary", getDashboardSummary);
router.get("/highlights", getDashboardHighlights);


module.exports = router;
