import { Router } from 'express';
import {
  createVendor,
  fetchVendors,
  fetchVendorById,
  updateVendor,
  deleteVendor,
} from './vendor.controller.js';
import { vendorSchema } from './vendor.validation.js';
import { checkPermission } from '../../../middlewares/auth.js';
import pagination from '../../../middlewares/pagination.js';
import validate from '../../../middlewares/validate.js';

const router = Router();

router.post(
  '/',

  checkPermission('vendor', 'create'),
  validate(vendorSchema),
  createVendor,
);

router.get('/', pagination, fetchVendors);
router.get('/:id', fetchVendorById);

router.put(
  '/:id',

  checkPermission('vendor', 'update'),
  validate(vendorSchema),
  updateVendor,
);

router.delete(
  '/:id',

  checkPermission('vendor', 'delete'),
  deleteVendor,
);

export default router;

