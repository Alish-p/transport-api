const { Router } = require("express");
const {
  createDriverDeduction,
  fetchDriverDeductions,
  fetchDriverDeduction,
  updateDriverDeduction,
  deleteDriverDeduction,
  repaymentDriverDeduction,
  fetchPendingDriverDeductions,
} = require("../controllers/driverDeduction");

const router = Router();

router.post("/", createDriverDeduction);
router.get("/", fetchDriverDeductions);
router.get("/:id", fetchDriverDeduction);
router.get("/driver/:id", fetchPendingDriverDeductions);

router.put("/:id", updateDriverDeduction);
router.delete("/:id", deleteDriverDeduction);
router.post("/repayment/:id", repaymentDriverDeduction);

module.exports = router;
