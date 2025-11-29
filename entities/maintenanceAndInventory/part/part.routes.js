import { Router } from 'express';
import {
  createPart,
  fetchParts,
  fetchPartById,
  updatePart,
  deletePart,
  adjustStock,
  fetchInventoryActivities,
} from './part.controller.js';
import { checkPermission } from '../../../middlewares/Auth.js';
import pagination from '../../../middlewares/pagination.js';

const router = Router();

router.post(
  '/',
  checkPermission('part', 'create'),
  createPart,
);

router.get('/activities', pagination, fetchInventoryActivities);
router.get('/', pagination, fetchParts);
router.get('/:id', fetchPartById);

router.put(
  '/:id',
  checkPermission('part', 'update'),
  updatePart,
);

router.post(
  '/:id/adjust-stock',
  checkPermission('part', 'update'),
  adjustStock,
);

router.delete(
  '/:id',
  checkPermission('part', 'delete'),
  deletePart,
);

export default router;

