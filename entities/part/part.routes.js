import { Router } from 'express';
import {
  createPart,
  fetchParts,
  fetchPartById,
  updatePart,
  deletePart,
} from './part.controller.js';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.post(
  '/',
  authenticate,
  checkPermission('part', 'create'),
  createPart,
);

router.get('/', authenticate, pagination, fetchParts);
router.get('/:id', authenticate, fetchPartById);

router.put(
  '/:id',
  authenticate,
  checkPermission('part', 'update'),
  updatePart,
);

router.delete(
  '/:id',
  authenticate,
  checkPermission('part', 'delete'),
  deletePart,
);

export default router;

