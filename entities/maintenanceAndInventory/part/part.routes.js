import { Router } from 'express';
import {
  createPart,
  createBulkParts,
  fetchParts,
  fetchPartById,
  updatePart,
  deletePart,
  getPartPriceHistory,
  getPhotoUploadUrl,
} from './part.controller.js';

import { checkPermission } from '../../../middlewares/auth.js';
import pagination from '../../../middlewares/pagination.js';

const router = Router();

router.post(
  '/',
  checkPermission('part', 'create'),
  createPart,
);

router.post(
  '/bulk',
  checkPermission('part', 'create'),
  createBulkParts,
);

// Photo upload (presigned URL)
router.get(
  '/photo/upload-url',
  checkPermission('part', 'create'), // assuming anyone who can create/update can upload 
  getPhotoUploadUrl
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
