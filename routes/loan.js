const express = require("express");
const {
  createLoan,
  fetchAllLoans,
  fetchLoanById,
  fetchPendingLoans,
  fetchNextPendingInstallment,
  updateLoan,
  deleteLoan,
  repayLoan,
} = require("../controllers/loan");

const { admin } = require("../middlewares/Auth");
const router = express.Router();

router.post("/", createLoan);
router.get("/", fetchAllLoans);
router.get("/pending/:borrowerType/:id", fetchNextPendingInstallment);
router.get("/:id", fetchLoanById);
router.put("/:id", updateLoan);
router.delete("/:id", deleteLoan);
router.post("/:id/repay", repayLoan);

module.exports = router;
