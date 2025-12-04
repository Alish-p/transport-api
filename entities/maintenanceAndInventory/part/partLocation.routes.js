import { Router } from 'express';
import {
  createPartLocation,
  fetchPartLocations,
  fetchPartLocationById,
  updatePartLocation,
  deletePartLocation,
} from './part.controller.js';
import { checkPermission } from '../../../middlewares/Auth.js';
import pagination from '../../../middlewares/pagination.js';

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

