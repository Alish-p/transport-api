import { Router } from 'express';
import {
  createPartLocation,
  fetchPartLocations,
  fetchPartLocationById,
  updatePartLocation,
  deletePartLocation,
} from './part.controller.js';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.post(
  '/',
  authenticate,
  checkPermission('partLocation', 'create'),
  createPartLocation,
);

router.get('/', authenticate, pagination, fetchPartLocations);
router.get('/:id', authenticate, fetchPartLocationById);

router.put(
  '/:id',
  authenticate,
  checkPermission('partLocation', 'update'),
  updatePartLocation,
);

router.delete(
  '/:id',
  authenticate,
  checkPermission('partLocation', 'delete'),
  deletePartLocation,
);

export default router;

