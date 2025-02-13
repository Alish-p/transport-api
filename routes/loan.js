const express = require("express");
const {
  createLoan,
  fetchAllLoans,
  fetchLoanById,
  fetchPendingLoans,
  updateLoan,
  deleteLoan,
  repayLoan,
} = require("../controllers/loan");

const { admin } = require("../middlewares/Auth");
const router = express.Router();

router.post("/", createLoan);
router.get("/", fetchAllLoans);
router.get("/pending/:borrowerType/:id", fetchPendingLoans);
router.get("/:id", fetchLoanById);
router.put("/:id", updateLoan);
router.delete("/:id", deleteLoan);

module.exports = router;
