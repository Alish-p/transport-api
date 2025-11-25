import { Router } from 'express';
import {
  createVendor,
  fetchVendors,
  fetchVendorById,
  updateVendor,
  deleteVendor,
} from './vendor.controller.js';
import { vendorSchema } from './vendor.validation.js';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';
import validate from '../../middlewares/validate.js';

const router = Router();

router.post(
  '/',
  authenticate,
  checkPermission('vendor', 'create'),
  validate(vendorSchema),
  createVendor,
);

router.get('/', authenticate, pagination, fetchVendors);
router.get('/:id', authenticate, fetchVendorById);

router.put(
  '/:id',
  authenticate,
  checkPermission('vendor', 'update'),
  validate(vendorSchema),
  updateVendor,
);

router.delete(
  '/:id',
  authenticate,
  checkPermission('vendor', 'delete'),
  deleteVendor,
);

export default router;

