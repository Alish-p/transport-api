import { Router } from 'express';
import pagination from '../../middlewares/pagination.js';
import { authenticate, checkPermission } from '../../middlewares/auth.js';
import {
  fetchSubtrips,
  fetchSubtrip,
  updateSubtrip,
  deleteSubtrip,
  receiveLR,
  resolveLR,
  fetchSubtripsByStatuses,
  fetchSubtripsByTransporter,
  fetchPaginatedSubtrips,
  exportSubtrips,
  getDocumentUploadUrl,
} from './subtrip.controller.js';
import { createJob } from '../job/job.controller.js';
import validate from '../../middlewares/validate.js';
import { jobCreateSchema, } from '../job/job.validation.js';
import { validateFormFields } from '../formConfig/formConfig.validation.js';

const router = Router();

// --- Job & Subtrip Creation ---
router.post(
  '/jobs',
  authenticate,
  checkPermission('subtrip', 'create'),
  validate(jobCreateSchema),
  validateFormFields('job_create'),
  createJob
);

// --- Utility Routes ---
router.get('/export', authenticate, exportSubtrips);
router.get('/upload-url', authenticate, getDocumentUploadUrl);

// --- Read / Fetch Subtrips ---
router.get('/:id', authenticate, fetchSubtrip);
router.get('/', authenticate, fetchSubtrips);
router.get('/pagination', authenticate, pagination, fetchPaginatedSubtrips);
router.get('/status', authenticate, pagination, fetchSubtripsByStatuses);
router.post('/by-transporter', authenticate, fetchSubtripsByTransporter);

// --- Subtrip CRUD (By ID) ---
router.put('/:id', authenticate, checkPermission('subtrip', 'update'), updateSubtrip);
router.delete('/:id', authenticate, checkPermission('subtrip', 'delete'), deleteSubtrip);

// --- Subtrip Actions ---
router.put(
  '/:id/receive',
  authenticate,
  checkPermission('subtrip', 'update'),
  validateFormFields('job_receive'),
  receiveLR
);
router.put(
  '/:id/resolve',
  authenticate,
  checkPermission('subtrip', 'update'),
  resolveLR
);

export default router;
