import { Router } from 'express';
import {
  createTransporterAdvance,
  fetchPaginatedAdvances,
  exportTransporterAdvances,
  deleteTransporterAdvance,
} from './transporterAdvance.controller.js';
import { authenticate } from '../../middlewares/auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.post('/', authenticate, createTransporterAdvance);
router.get('/pagination', authenticate, pagination, fetchPaginatedAdvances);
router.get('/export', authenticate, exportTransporterAdvances);
router.delete('/:id', authenticate, deleteTransporterAdvance);

export default router;
