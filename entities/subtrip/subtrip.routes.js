import { Router } from 'express';

import validate from '../../middlewares/validate.js';
import pagination from '../../middlewares/pagination.js';
import { jobCreateSchema } from './subtrip.validation.js';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import { validateFieldConfig } from '../fieldConfig/fieldConfig.validation.js';
import {
  receiveLR,
  resolveLR,
  createJob,
  fetchSubtrip,
  fetchSubtrips,
  updateSubtrip,
  deleteSubtrip,
  exportSubtrips,
  getDocumentUploadUrl,
  fetchPaginatedSubtrips,
  fetchSubtripsByStatuses,
  fetchSubtripsByTransporter,
} from './subtrip.controller.js';

const router = Router();

// --- Job & Subtrip Creation ---
router.post(
  '/jobs',
  authenticate,
  checkPermission('subtrip', 'create'),
  validate(jobCreateSchema),
  validateFieldConfig('subtrip'),
  createJob
);

// --- Utility Routes ---
router.get('/export', authenticate, exportSubtrips);
router.get('/upload-url', authenticate, getDocumentUploadUrl);

// --- Read / Fetch Subtrips ---
router.get('/pagination', authenticate, pagination, fetchPaginatedSubtrips);
router.get('/status', authenticate, pagination, fetchSubtripsByStatuses);
router.get('/:id', authenticate, fetchSubtrip);
router.get('/', authenticate, fetchSubtrips);
router.post('/by-transporter', authenticate, fetchSubtripsByTransporter);

// --- Subtrip CRUD (By ID) ---
router.put('/:id', authenticate, checkPermission('subtrip', 'update'), validateFieldConfig('subtrip'), updateSubtrip);
router.delete('/:id', authenticate, checkPermission('subtrip', 'delete'), deleteSubtrip);

// --- Subtrip Actions ---
router.put(
  '/:id/receive',
  authenticate,
  checkPermission('subtrip', 'update'),
  receiveLR
);
router.put(
  '/:id/resolve',
  authenticate,
  checkPermission('subtrip', 'update'),
  resolveLR
);

export default router;
