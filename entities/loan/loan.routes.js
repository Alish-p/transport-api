import { Router } from 'express';

import pagination from '../../middlewares/pagination.js';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import {
  repayLoan,
  createLoan,
  deleteLoan,
  updateLoan,
  exportLoans,
  fetchLoanById,
  fetchPendingLoans,
  fetchPaginatedLoans,
} from './loan.controller.js';

const router = Router();

router.post('/', authenticate, checkPermission('loan', 'create'), createLoan);
router.post('/:id/repay', authenticate, repayLoan);
router.get('/export', authenticate, exportLoans);
router.get('/', authenticate, pagination, fetchPaginatedLoans);
router.get('/pending/:borrowerType/:id', authenticate, fetchPendingLoans);
router.get('/:id', authenticate, fetchLoanById);
router.put('/:id', authenticate, checkPermission('loan', 'update'), updateLoan);
router.delete('/:id', authenticate, checkPermission('loan', 'delete'), deleteLoan);

export default router;
