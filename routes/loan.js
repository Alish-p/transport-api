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

const { private, checkPermission } = require("../middlewares/Auth");
const router = express.Router();

router.post("/", private, checkPermission("loan", "create"), createLoan);
router.post("/:id/repay", private, repayLoan);
router.get("/", private, fetchAllLoans);
router.get("/pending/:borrowerType/:id", private, fetchPendingLoans);
router.get("/:id", private, fetchLoanById);
router.put("/:id", private, checkPermission("loan", "update"), updateLoan);
router.delete("/:id", private, checkPermission("loan", "delete"), deleteLoan);

router.post("/:id/defer-next", private, deferNextInstallment);
router.post("/:id/defer-all", private, deferAllInstallments);

module.exports = router;
