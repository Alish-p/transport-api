import { Router } from 'express';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import pagination from '../../middlewares/pagination.js';
import {
  getUploadUrl,
  createDocument,
  getDownloadUrl,
  updateDocument,
  deleteDocument,
  fetchDocumentsList,
} from './vehicleDocument.controller.js';

const router = Router({ mergeParams: true });

// Upload (presigned URL) and create record
router.get(
  '/:vehicleId/upload-url',
  authenticate,
  checkPermission('vehicle', 'update'),
  getUploadUrl
);

router.post(
  '/:vehicleId',
  authenticate,
  checkPermission('vehicle', 'update'),
  createDocument
);


// Secure download (presigned GET)
router.get(
  '/:vehicleId/:docId/download',
  authenticate,
  checkPermission('vehicle', 'view'),
  getDownloadUrl
);

// Update document metadata
router.put(
  '/:vehicleId/:docId',
  authenticate,
  checkPermission('vehicle', 'update'),
  updateDocument
);

// Delete document record
router.delete(
  '/:vehicleId/:docId',
  authenticate,
  checkPermission('vehicle', 'delete'),
  deleteDocument
);

// Paginated listing with filters and status totals
router.get(
  '/',
  authenticate,
  checkPermission('vehicle', 'view'),
  pagination,
  fetchDocumentsList
);

export default router;
