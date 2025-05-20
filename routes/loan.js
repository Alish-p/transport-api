const express = require("express");
const {
  createLoan,
  deleteLoan,
  fetchAllLoans,
  fetchLoanById,
  repayLoan,
  updateLoan,
  fetchPendingLoans,
  deferAllInstallments,
  deferNextInstallment,
} = require("../controllers/loan");

const { admin } = require("../middlewares/Auth");
const router = express.Router();

router.post("/", createLoan);
router.post("/:id/repay", repayLoan);
router.get("/", fetchAllLoans);
router.get("/pending/:borrowerType/:id", fetchPendingLoans);
router.get("/:id", fetchLoanById);
router.put("/:id", updateLoan);
router.delete("/:id", deleteLoan);

router.post("/:id/defer-next", deferNextInstallment);
router.post("/:id/defer-all", deferAllInstallments);

module.exports = router;
