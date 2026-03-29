import { Router } from 'express';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import pagination from '../../middlewares/pagination.js';
import {
  createLoan,
  deleteLoan,
  fetchPaginatedLoans,
  fetchLoanById,
  repayLoan,
  updateLoan,
  fetchPendingLoans,
} from './loan.controller.js';

const router = Router();

router.post('/', authenticate, checkPermission('loan', 'create'), createLoan);
router.post('/:id/repay', authenticate, repayLoan);
router.get('/', authenticate, pagination, fetchPaginatedLoans);
router.get('/pending/:borrowerType/:id', authenticate, fetchPendingLoans);
router.get('/:id', authenticate, fetchLoanById);
router.put('/:id', authenticate, checkPermission('loan', 'update'), updateLoan);
router.delete('/:id', authenticate, checkPermission('loan', 'delete'), deleteLoan);

export default router;
