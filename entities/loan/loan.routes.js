import { Router } from 'express';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import validateZod from '../../middlewares/validate.js';
import { loanSchema } from './loan.validation.js';
import {
  createLoan,
  deleteLoan,
  fetchAllLoans,
  fetchLoanById,
  repayLoan,
  updateLoan,
  fetchPendingLoans,
  deferAllInstallments,
  deferNextInstallment,
} from './loan.controller.js';

const router = Router();

router.post('/', authenticate, checkPermission('loan', 'create'), validateZod(loanSchema), createLoan);
router.post('/:id/repay', authenticate, repayLoan);
router.get('/', authenticate, fetchAllLoans);
router.get('/pending/:borrowerType/:id', authenticate, fetchPendingLoans);
router.get('/:id', authenticate, fetchLoanById);
router.put('/:id', authenticate, checkPermission('loan', 'update'), updateLoan);
router.delete('/:id', authenticate, checkPermission('loan', 'delete'), deleteLoan);
router.post('/:id/defer-next', authenticate, deferNextInstallment);
router.post('/:id/defer-all', authenticate, deferAllInstallments);

export default router;
