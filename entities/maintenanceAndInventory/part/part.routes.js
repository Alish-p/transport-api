import { Router } from 'express';
import {
  createPart,
  fetchParts,
  fetchPartById,
  updatePart,
  deletePart,
  getPartPriceHistory,
} from './part.controller.js';

import { checkPermission } from '../../../middlewares/auth.js';
import pagination from '../../../middlewares/pagination.js';

const router = Router();

router.post(
  '/',
  checkPermission('part', 'create'),
  createPart,
);

// This needs to be before /:id to avoid conflict
router.get('/', pagination, fetchParts);
router.get('/:id', fetchPartById);

router.put(
  '/:id',
  checkPermission('part', 'update'),
  updatePart,
);

router.delete(
  '/:id',
  checkPermission('part', 'delete'),
  deletePart,
);
router.get('/:id/price-history', getPartPriceHistory);

export default router;
