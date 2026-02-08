import { Router } from 'express';
import {
  createDriver,
  quickCreateDriver,
  fetchDrivers,
  deleteDriver,
  updateDriver,
  fetchDriverById,
  fetchDriversSummary,
} from './driver.controller.js';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import pagination from '../../middlewares/pagination.js';

const router = Router();

router.post('/', authenticate, checkPermission('driver', 'create'), createDriver);
router.post(
  '/quick',
  authenticate,
  checkPermission('driver', 'create'),
  quickCreateDriver
);
router.get('/', authenticate, pagination, fetchDrivers);
router.get('/summary', authenticate, fetchDriversSummary);
router.get('/:id', authenticate, fetchDriverById);
router.delete(
  '/:id',
  authenticate,
  checkPermission('driver', 'delete'),
  deleteDriver
);
router.put('/:id', authenticate, checkPermission('driver', 'update'), updateDriver);

export default router;
