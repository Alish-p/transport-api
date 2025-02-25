const { Router } = require("express");
const { getDashboardSummary } = require("../controllers/dashboard");

const router = Router();

router.get("/summary", getDashboardSummary);

module.exports = router;
