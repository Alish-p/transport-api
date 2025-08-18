import { Router } from 'express';
import {
  createPump,
  fetchPumps,
  deletePump,
  fetchPumpById,
  updatePump,
} from './pump.controller.js';
import { pumpSchema } from './pump.validation.js';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.post(
  '/',
  authenticate,
  checkPermission('pump', 'create'),
  createPump,
);
router.get('/', authenticate, pagination, fetchPumps);
router.get('/:id', authenticate, fetchPumpById);
router.delete('/:id', authenticate, checkPermission('pump', 'delete'), deletePump);
router.put(
  '/:id',
  authenticate,
  checkPermission('pump', 'update'),
  updatePump,
);

export default router;
