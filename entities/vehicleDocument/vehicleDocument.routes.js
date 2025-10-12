import { Router } from 'express';
import { authenticate, checkPermission } from '../../middlewares/Auth.js';
import {
  getUploadUrl,
  createDocument,
  getActiveDocuments,
  getDocumentHistory,
  getMissingDocuments,
  getExpiringDocuments,
  getDownloadUrl,
  updateDocument,
  deleteDocument,
} from './vehicleDocument.controller.js';

const router = Router({ mergeParams: true });

// Upload (presigned URL) and create record
router.get(
  '/:vehicleId/documents/upload-url',
  authenticate,
  checkPermission('vehicle', 'update'),
  getUploadUrl
);

router.post(
  '/:vehicleId/documents',
  authenticate,
  checkPermission('vehicle', 'update'),
  createDocument
);

// Active docs for a vehicle
router.get(
  '/:vehicleId/documents/active',
  authenticate,
  checkPermission('vehicle', 'view'),
  getActiveDocuments
);

// History
router.get(
  '/:vehicleId/documents/history',
  authenticate,
  checkPermission('vehicle', 'view'),
  getDocumentHistory
);

// Missing required docs
router.get(
  '/:vehicleId/documents/missing',
  authenticate,
  checkPermission('vehicle', 'view'),
  getMissingDocuments
);

// Calendar-style expiring docs (tenant-wide or filtered)
router.get(
  '/documents/expiring',
  authenticate,
  checkPermission('vehicle', 'view'),
  getExpiringDocuments
);

// Secure download (presigned GET)
router.get(
  '/:vehicleId/documents/:docId/download',
  authenticate,
  checkPermission('vehicle', 'view'),
  getDownloadUrl
);

// Update document metadata
router.put(
  '/:vehicleId/documents/:docId',
  authenticate,
  checkPermission('vehicle', 'update'),
  updateDocument
);

// Delete document record
router.delete(
  '/:vehicleId/documents/:docId',
  authenticate,
  checkPermission('vehicle', 'delete'),
  deleteDocument
);

export default router;
