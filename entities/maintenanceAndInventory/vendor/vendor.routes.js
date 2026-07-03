import { Router } from 'express';

import { vendorSchema } from './vendor.validation.js';
import validate from '../../../middlewares/validate.js';
import pagination from '../../../middlewares/pagination.js';
import { checkPermission } from '../../../middlewares/auth.js';
import {
  createVendor,
  fetchVendors,
  updateVendor,
  deleteVendor,
  fetchVendorById,
} from './vendor.controller.js';

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

