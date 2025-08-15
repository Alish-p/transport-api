import express from 'express';
import { createLoan,
  deleteLoan,
  fetchAllLoans,
  fetchLoanById,
  repayLoan,
  updateLoan,
  fetchPendingLoans,
  deferAllInstallments,
  deferNextInstallment, } from '../controllers/loan.js';

import { authenticate, checkPermission } from '../middlewares/Auth.js';

const router = express.Router();

router.post("/", authenticate, checkPermission("loan", "create"), createLoan);
router.post("/:id/repay", authenticate, repayLoan);
router.get("/", authenticate, fetchAllLoans);
router.get("/pending/:borrowerType/:id", authenticate, fetchPendingLoans);
router.get("/:id", authenticate, fetchLoanById);
router.put("/:id", authenticate, checkPermission("loan", "update"), updateLoan);
router.delete("/:id", authenticate, checkPermission("loan", "delete"), deleteLoan);

router.post("/:id/defer-next", authenticate, deferNextInstallment);
router.post("/:id/defer-all", authenticate, deferAllInstallments);

export default router;
