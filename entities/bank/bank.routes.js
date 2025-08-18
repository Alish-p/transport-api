import { Router } from 'express';
import {
  createBank,
  fetchBanks,
  deleteBank,
  updateBank,
  fetchBankDetails,
} from './bank.controller.js';
import { bankSchema } from './bank.validation.js';
import validateZod from '../../middlewares/validate.js';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.post(
  '/',
  authenticate,
  checkPermission('bank', 'create'),
  validateZod(bankSchema),
  createBank,
);
router.get('/', authenticate, pagination, fetchBanks);
router.get('/:id', authenticate, fetchBankDetails);
router.delete(
  '/:id',
  authenticate,
  checkPermission('bank', 'delete'),
  deleteBank,
);
router.put(
  '/:id',
  authenticate,
  checkPermission('bank', 'update'),
  validateZod(bankSchema),
  updateBank,
);

export default router;
