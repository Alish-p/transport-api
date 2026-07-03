import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.js';
import pagination from '../../middlewares/pagination.js';
import {
  fetchPaginatedAdvances,
  createTransporterAdvance,
  deleteTransporterAdvance,
  exportTransporterAdvances,
} from './transporterAdvance.controller.js';

const router = Router();

router.post('/', authenticate, createTransporterAdvance);
router.get('/pagination', authenticate, pagination, fetchPaginatedAdvances);
router.get('/export', authenticate, exportTransporterAdvances);
router.delete('/:id', authenticate, deleteTransporterAdvance);

export default router;
