import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Vehicle from '../vehicle/vehicle.model.js';
import VehicleDocument from './vehicleDocument.model.js';
import { REQUIRED_DOC_TYPES } from './vehicleDocument.constants.js';
import Tenant from '../tenant/tenant.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { buildPublicFileUrl, createPresignedPutUrl, createPresignedGetUrl, deleteObjectFromS3 } from '../../services/s3.service.js';

function ensureObjectId(id) {
  return new mongoose.Types.ObjectId(id);
}

// Generate presigned URL for direct upload to S3
function sanitizeSegment(input, toLower = true) {
  const str = String(input || '')
    .normalize('NFKD')
    .replace(/[^\w\-\s.]/g, ' ') // remove unsafe chars
    .replace(/\s+/g, '-') // spaces to dashes
    .replace(/-+/g, '-') // collapse dashes
    .replace(/^[-.]+|[-.]+$/g, ''); // trim dashes/dots
  return toLower ? str.toLowerCase() : str;
}

export const getUploadUrl = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;
  const { docType, contentType } = req.query;

  if (!docType) return res.status(400).json({ message: 'docType is required' });
  if (!contentType) return res.status(400).json({ message: 'contentType is required' });

  // Validate vehicle ownership/tenant
  const vehicle = await Vehicle.findOne({ _id: vehicleId, tenant: req.tenant });
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

  // Validate doc type to avoid unsafe path segments
  const allowedTypes = ['Insurance', 'PUC', 'RC', 'Fitness', 'Permit', 'Tax', 'Other'];
  if (!allowedTypes.includes(String(docType))) {
    return res.status(400).json({ message: 'Invalid docType' });
  }

  // Fetch tenant name/slug for key prefix
  const tenantDoc = await Tenant.findOne({ _id: req.tenant }).select('name slug');
  const tenantSegment = sanitizeSegment(tenantDoc?.slug || tenantDoc?.name || 'tenant', true);
  const vehicleSegment = sanitizeSegment(vehicle.vehicleNo || String(vehicleId), false);
  const docTypeSegment = sanitizeSegment(docType, true);

  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  // Key format: <tenantName>/vehicles/<vehicleNo>/<docType>/<ts>_<rand>
  const key = `${tenantSegment}/vehicles/${vehicleSegment}/${docTypeSegment}/${timestamp}_${random}`;

  try {
    const url = await createPresignedPutUrl({ key, contentType, expiresIn: 900 });
    return res.status(200).json({ key, uploadUrl: url });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create upload URL', error: err.message });
  }
});

// Create document record (after client uploads with presigned URL)
export const createDocument = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;
  const { docType, docNumber, issueDate, expiryDate, fileKey } = req.body;

  if (!docType || !docNumber) {
    return res.status(400).json({ message: 'docType and docNumber are required' });
  }

  const vehicle = await Vehicle.findOne({ _id: vehicleId, tenant: req.tenant });
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

  // Deactivate previous active doc of same type for this vehicle
  await VehicleDocument.updateMany(
    { tenant: req.tenant, vehicle: vehicleId, docType, isActive: true },
    { $set: { isActive: false } }
  );

  const fileUrl = fileKey ? buildPublicFileUrl(fileKey) : undefined;
  const doc = await VehicleDocument.create({
    tenant: req.tenant,
    vehicle: vehicle._id,
    docType,
    docNumber,
    issueDate: issueDate ? new Date(issueDate) : undefined,
    expiryDate: expiryDate ? new Date(expiryDate) : undefined,
    storageProvider: 's3',
    ...(fileKey ? { fileKey } : {}),
    ...(fileUrl ? { fileUrl } : {}),
    createdBy: req.user._id,
    isActive: true,
  });

  return res.status(201).json(doc);
});

// List active documents for a vehicle
export const getActiveDocuments = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;
  const docs = await VehicleDocument.find({ tenant: req.tenant, vehicle: vehicleId, isActive: true })
    .sort({ docType: 1 })
    .lean();
  return res.status(200).json(docs);
});

// List document history (optionally filtered by docType)
export const getDocumentHistory = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;
  const { docType } = req.query;
  const query = addTenantToQuery(req, { vehicle: ensureObjectId(vehicleId) });
  if (docType) query.docType = docType;
  const docs = await VehicleDocument.find(query).sort({ createdAt: -1 }).lean();
  return res.status(200).json(docs);
});

// Identify missing required docs for a vehicle (no active record)
export const getMissingDocuments = asyncHandler(async (req, res) => {
  const { vehicleId } = req.params;
  const activeDocs = await VehicleDocument.find({ tenant: req.tenant, vehicle: vehicleId, isActive: true })
    .select('docType')
    .lean();
  const present = new Set(activeDocs.map((d) => d.docType));
  const missing = REQUIRED_DOC_TYPES.filter((t) => !present.has(t));
  return res.status(200).json({ required: REQUIRED_DOC_TYPES, missing });
});

// Calendar-like view: show documents expiring within date range
export const getExpiringDocuments = asyncHandler(async (req, res) => {
  const { from, to, vehicleId, docType } = req.query;
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);

  const query = addTenantToQuery(req, { isActive: true });
  if (Object.keys(range).length) query.expiryDate = range;
  if (vehicleId) query.vehicle = ensureObjectId(vehicleId);
  if (docType) query.docType = docType;

  const docs = await VehicleDocument.find(query)
    .populate('vehicle', 'vehicleNo')
    .sort({ expiryDate: 1 })
    .lean();

  return res.status(200).json(docs);
});

// Get a short-lived download URL for a document (private bucket safe)
export const getDownloadUrl = asyncHandler(async (req, res) => {
  const { vehicleId, docId } = req.params;

  const doc = await VehicleDocument.findOne({
    _id: docId,
    tenant: req.tenant,
    vehicle: vehicleId,
  }).lean();
  if (!doc) return res.status(404).json({ message: 'Document not found' });

  try {
    const url = await createPresignedGetUrl({ key: doc.fileKey, expiresIn: 300 }); // 5 minutes
    return res.status(200).json({ url, expiresIn: 300 });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create download URL', error: err.message });
  }
});

// Update a vehicle document's metadata
export const updateDocument = asyncHandler(async (req, res) => {
  const { vehicleId, docId } = req.params;
  const { docNumber, issueDate, expiryDate, isActive, docType, fileKey } = req.body || {};

  const doc = await VehicleDocument.findOne({ _id: docId, tenant: req.tenant, vehicle: vehicleId });
  if (!doc) return res.status(404).json({ message: 'Document not found' });

  const setUpdates = {};
  const unsetUpdates = {};
  const updates = {};
  if (typeof docNumber !== 'undefined') updates.docNumber = docNumber;
  if (typeof issueDate !== 'undefined') updates.issueDate = issueDate ? new Date(issueDate) : undefined;
  if (typeof expiryDate !== 'undefined') updates.expiryDate = expiryDate ? new Date(expiryDate) : undefined;
  if (typeof isActive !== 'undefined') updates.isActive = Boolean(isActive);
  if (typeof docType !== 'undefined') {
    const allowedTypes = ['Insurance', 'PUC', 'RC', 'Fitness', 'Permit', 'Tax', 'Other'];
    if (!allowedTypes.includes(String(docType))) {
      return res.status(400).json({ message: 'Invalid docType' });
    }
    updates.docType = docType;
  }

  // Handle fileKey changes: replace or remove
  const prevKey = doc.fileKey;
  if (fileKey === null) {
    // Remove existing file (optional: attempt delete in S3)
    if (prevKey) {
      try { await deleteObjectFromS3(prevKey); } catch (e) { /* non-blocking */ }
    }
    unsetUpdates.fileKey = '';
    unsetUpdates.fileUrl = '';
  } else if (typeof fileKey === 'string' && fileKey && fileKey !== prevKey) {
    // Replacing file: optionally delete old
    if (prevKey) {
      try { await deleteObjectFromS3(prevKey); } catch (e) { /* non-blocking */ }
    }
    setUpdates.fileKey = fileKey;
    setUpdates.fileUrl = buildPublicFileUrl(fileKey) || null;
  }

  const newType = updates.docType ?? doc.docType;
  const willBeActive = typeof updates.isActive === 'boolean' ? updates.isActive : doc.isActive;

  if (willBeActive) {
    // Ensure only one active doc per type
    await VehicleDocument.updateMany(
      { tenant: req.tenant, vehicle: vehicleId, docType: newType, isActive: true, _id: { $ne: docId } },
      { $set: { isActive: false } }
    );
  }

  const updateOps = {};
  if (Object.keys(updates).length || Object.keys(setUpdates).length) {
    updateOps.$set = { ...(Object.keys(updates).length ? updates : {}), ...(Object.keys(setUpdates).length ? setUpdates : {}) };
  }
  if (Object.keys(unsetUpdates).length) {
    updateOps.$unset = unsetUpdates;
  }

  const updated = await VehicleDocument.findOneAndUpdate(
    { _id: docId, tenant: req.tenant, vehicle: vehicleId },
    Object.keys(updateOps).length ? updateOps : {},
    { new: true }
  );

  return res.status(200).json(updated);
});

// Delete a vehicle document record (does not delete S3 object)
export const deleteDocument = asyncHandler(async (req, res) => {
  const { vehicleId, docId } = req.params;
  const doc = await VehicleDocument.findOne({ _id: docId, tenant: req.tenant, vehicle: vehicleId });
  if (!doc) return res.status(404).json({ message: 'Document not found' });

  try {
    await deleteObjectFromS3(doc.fileKey);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete file from S3', error: err.message });
  }

  await VehicleDocument.deleteOne({ _id: docId, tenant: req.tenant, vehicle: vehicleId });
  return res.status(200).json({ message: 'Deleted', id: docId });
});
