import { Router } from 'express';

import pagination from '../../../middlewares/pagination.js';
import { checkPermission } from '../../../middlewares/auth.js';
import {
  createPartLocation,
  fetchPartLocations,
  updatePartLocation,
  deletePartLocation,
  fetchPartLocationById,
} from './partLocation.controller.js';

const router = Router();

router.post(
  '/',
  checkPermission('partLocation', 'create'),
  createPartLocation,
);

router.get('/', pagination, fetchPartLocations);
router.get('/:id', fetchPartLocationById);

router.put(
  '/:id',
  checkPermission('partLocation', 'update'),
  updatePartLocation,
);

router.delete(
  '/:id',
  checkPermission('partLocation', 'delete'),
  deletePartLocation,
);

export default router;

