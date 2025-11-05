import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Vehicle from '../vehicle/vehicle.model.js';
import VehicleDocument from './vehicleDocument.model.js';
import { REQUIRED_DOC_TYPES } from './vehicleDocument.constants.js';
import Tenant from '../tenant/tenant.model.js';
import { addTenantToQuery } from '../../utils/tenant-utils.js';
import { buildPublicFileUrl, createPresignedPutUrl, createPresignedGetUrl, deleteObjectFromS3 } from '../../services/s3.service.js';
import { fetchVehicleByNumber, extractDocuments } from '../../helpers/webcorevision.js';

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
  const { docType, contentType, extension } = req.query;

  if (!docType) return res.status(400).json({ message: 'docType is required' });
  if (!contentType) return res.status(400).json({ message: 'contentType is required' });
  if (!extension) return res.status(400).json({ message: 'extension is required (e.g., pdf, jpg)' });

  // Validate vehicle ownership/tenant (own vehicles only)
  const vehicle = await Vehicle.findOne({ _id: vehicleId, tenant: req.tenant, isOwn: true });
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

  // Build filename: <docType>_YYYY-MM-DD_<rand4>.<ext>
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand4 = Math.random().toString(36).slice(2, 6);
  const safeExt = String(extension).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!safeExt) return res.status(400).json({ message: 'Invalid extension' });
  const filename = `${docTypeSegment}_${yyyy}-${mm}-${dd}_${rand4}.${safeExt}`;

  // Final key: <tenant>/vehicles/<vehicleNo>/<docType>/<filename>
  const key = `${tenantSegment}/vehicles/${vehicleSegment}/${docTypeSegment}/${filename}`;

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
  const { docType, docNumber, issueDate, expiryDate, fileKey, issuer } = req.body;

  if (!docType) {
    return res.status(400).json({ message: 'docType is required' });
  }

  const vehicle = await Vehicle.findOne({ _id: vehicleId, tenant: req.tenant, isOwn: true });
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
    ...(typeof docNumber !== 'undefined' ? { docNumber } : {}),
    issuer,
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
  const { docNumber, issueDate, expiryDate, isActive, docType, fileKey, issuer } = req.body || {};

  const doc = await VehicleDocument.findOne({ _id: docId, tenant: req.tenant, vehicle: vehicleId });
  if (!doc) return res.status(404).json({ message: 'Document not found' });

  const setUpdates = {};
  const unsetUpdates = {};
  const updates = {};
  if (typeof docNumber !== 'undefined') updates.docNumber = docNumber;
  if (typeof issueDate !== 'undefined') updates.issueDate = issueDate ? new Date(issueDate) : undefined;
  if (typeof expiryDate !== 'undefined') updates.expiryDate = expiryDate ? new Date(expiryDate) : undefined;
  if (typeof isActive !== 'undefined') updates.isActive = Boolean(isActive);
  if (typeof issuer !== 'undefined') {
    if (issuer === null) {
      unsetUpdates.issuer = '';
    } else {
      updates.issuer = issuer;
    }
  }
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

  let s3Deleted = false;
  let s3Error;
  // Attempt S3 delete only if we have a key; treat failures as non-blocking
  if (doc.fileKey) {
    try {
      await deleteObjectFromS3(doc.fileKey);
      s3Deleted = true;
    } catch (err) {
      s3Error = err?.message || 'Unknown S3 error';
      // Intentionally do not block record deletion
    }
  }

  await VehicleDocument.deleteOne({ _id: docId, tenant: req.tenant, vehicle: vehicleId });
  return res.status(200).json({ message: 'Deleted', id: docId, s3Deleted, ...(s3Error ? { s3Error } : {}) });
});

// Fetch paginated vehicle documents with filters and status totals
export const fetchDocumentsList = asyncHandler(async (req, res) => {
  const {
    status, // one of: missing, expiring, expired, valid
    vehicleId,
    documentType,
    docType, // alias
    expiryFrom,
    expiryTo,
    issueFrom,
    issueTo,
    createdBy,
    docNumber,
    issuer,
    days, // expiring window
  } = req.query;

  const { limit, skip } = req.pagination || { limit: 10, skip: 0 };

  const now = new Date();
  const windowDays = Number(days) > 0 ? Number(days) : 30;
  const expiringEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  // Build base document query
  // By default include only active documents. Allow explicit filter via `isActive` query param.
  // Accepted values: 'true' | 'false' (case-insensitive) or boolean-y.
  let isActiveFilter;
  if (typeof req.query.isActive !== 'undefined') {
    const v = String(req.query.isActive).toLowerCase();
    if (v === 'true' || v === '1') isActiveFilter = true;
    else if (v === 'false' || v === '0') isActiveFilter = false;
  }
  const baseQuery = addTenantToQuery(req, {
    ...(typeof isActiveFilter === 'boolean' ? { isActive: isActiveFilter } : { isActive: true }),
  });
  const effectiveDocType = documentType || docType;
  if (effectiveDocType) baseQuery.docType = effectiveDocType;
  if (vehicleId) baseQuery.vehicle = vehicleId;
  if (createdBy) baseQuery.createdBy = createdBy;
  if (docNumber) {
    const escaped = String(docNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    baseQuery.docNumber = { $regex: escaped, $options: 'i' };
  }
  if (issuer) {
    const escaped = String(issuer).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    baseQuery.issuer = { $regex: escaped, $options: 'i' };
  }
  if (issueFrom || issueTo) {
    baseQuery.issueDate = {};
    if (issueFrom) baseQuery.issueDate.$gte = new Date(issueFrom);
    if (issueTo) baseQuery.issueDate.$lte = new Date(issueTo);
  }
  if (expiryFrom || expiryTo) {
    baseQuery.expiryDate = baseQuery.expiryDate || {};
    if (expiryFrom) baseQuery.expiryDate.$gte = new Date(expiryFrom);
    if (expiryTo) baseQuery.expiryDate.$lte = new Date(expiryTo);
  }

  // Helper: add status filter to a query (expired/expiring/valid)
  const withStatusFilter = (q, st) => {
    const query = { ...q };
    if (st === 'expired') {
      query.expiryDate = { ...(query.expiryDate || {}), $ne: null, $lt: now };
    } else if (st === 'expiring') {
      query.expiryDate = { ...(query.expiryDate || {}), $ne: null, $gte: now, $lte: expiringEnd };
    } else if (st === 'valid') {
      // No expiry OR expiry beyond window end
      query.$or = [
        { expiryDate: null },
        { expiryDate: { ...(query.expiryDate || {}), $gt: expiringEnd } },
      ];
      // Remove direct expiryDate if present to avoid conflict with $or
      delete query.expiryDate;
    }
    return query;
  };

  // Compute totals (expired/expiring/valid)
  const [expiredCount, expiringCount, validCount] = await Promise.all([
    VehicleDocument.countDocuments(withStatusFilter(baseQuery, 'expired')),
    VehicleDocument.countDocuments(withStatusFilter(baseQuery, 'expiring')),
    VehicleDocument.countDocuments(withStatusFilter(baseQuery, 'valid')),
  ]);

  // Compute missing count (based on required types and vehicle scope)
  // Determine vehicles considered for missing
  let vehicleIds = [];
  if (vehicleId) {
    const vehicles = await Vehicle.find(
      addTenantToQuery(req, { _id: vehicleId, isOwn: true })
    )
      .select('_id')
      .lean();
    vehicleIds = vehicles.map((v) => String(v._id));
  } else {
    const vehicles = await Vehicle.find(
      addTenantToQuery(req, { isOwn: true })
    )
      .select('_id')
      .lean();
    vehicleIds = vehicles.map((v) => String(v._id));
  }

  // Determine required types scope
  const requiredTypesScope = effectiveDocType && REQUIRED_DOC_TYPES.includes(String(effectiveDocType))
    ? [String(effectiveDocType)]
    : REQUIRED_DOC_TYPES;

  let totalMissing = 0;
  if (vehicleIds.length > 0 && requiredTypesScope.length > 0) {
    const activeRequiredDocs = await VehicleDocument.find({
      tenant: req.tenant,
      isActive: true,
      vehicle: { $in: vehicleIds },
      docType: { $in: requiredTypesScope },
    })
      .select('vehicle docType')
      .lean();

    const presentByVehicle = new Map();
    for (const d of activeRequiredDocs) {
      const key = String(d.vehicle);
      if (!presentByVehicle.has(key)) presentByVehicle.set(key, new Set());
      presentByVehicle.get(key).add(d.docType);
    }
    for (const vid of vehicleIds) {
      const present = presentByVehicle.get(String(vid)) || new Set();
      for (const t of requiredTypesScope) {
        if (!present.has(t)) totalMissing += 1;
      }
    }
  }

  // When listing results
  const statusFilter = typeof status === 'string' ? status.toLowerCase() : undefined;

  if (statusFilter === 'missing') {
    // Build missing rows (synthetic) and paginate in-memory
    const activeRequiredDocs = await VehicleDocument.find({
      tenant: req.tenant,
      isActive: true,
      vehicle: { $in: vehicleIds },
      docType: { $in: requiredTypesScope },
    })
      .select('vehicle docType')
      .lean();

    const presentByVehicle = new Map();
    for (const d of activeRequiredDocs) {
      const key = String(d.vehicle);
      if (!presentByVehicle.has(key)) presentByVehicle.set(key, new Set());
      presentByVehicle.get(key).add(d.docType);
    }

    // Preload vehicle numbers for mapping
    const vehiclesForMap = await Vehicle.find(addTenantToQuery(req, { _id: { $in: vehicleIds } }))
      .select('_id vehicleNo')
      .lean();
    const vMap = new Map(vehiclesForMap.map((v) => [String(v._id), v.vehicleNo]));

    const synthetic = [];
    for (const vid of vehicleIds) {
      const present = presentByVehicle.get(String(vid)) || new Set();
      for (const t of requiredTypesScope) {
        if (!present.has(t)) {
          synthetic.push({
            _id: null,
            vehicle: vid,
            vehicleNo: vMap.get(String(vid)) || null,
            docType: t,
            docNumber: null,
            issuer: null,
            issueDate: null,
            expiryDate: null,
            createdBy: null,
            createdByName: null,
            isActive: false,
            status: 'missing',
          });
        }
      }
    }

    const paged = synthetic.slice(skip, skip + limit);
    return res.status(200).json({
      results: paged,
      total: synthetic.length,
      totalMissing: totalMissing,
      totalExpiring: expiringCount,
      totalExpired: expiredCount,
      totalValid: validCount,
      startRange: synthetic.length ? skip + 1 : 0,
      endRange: skip + paged.length,
    });
  }

  // Otherwise list actual documents, optionally filtered by status
  const docQuery = statusFilter ? withStatusFilter(baseQuery, statusFilter) : baseQuery;

  const [docs, docsTotal] = await Promise.all([
    VehicleDocument.find(docQuery)
      .populate({ path: 'vehicle', select: 'vehicleNo' })
      .populate({ path: 'createdBy', select: 'name' })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VehicleDocument.countDocuments(docQuery),
  ]);

  // Decorate each result with computed status
  const results = docs.map((d) => {
    const exp = d.expiryDate ? new Date(d.expiryDate) : null;
    let st = 'valid';
    if (exp) {
      if (exp < now) st = 'expired';
      else if (exp <= expiringEnd) st = 'expiring';
      else st = 'valid';
    } else {
      st = 'valid';
    }
    return {
      ...d,
      status: st,
      vehicleNo: d.vehicle && typeof d.vehicle === 'object' ? d.vehicle.vehicleNo : undefined,
      createdByName: d.createdBy && typeof d.createdBy === 'object' ? d.createdBy.name : undefined,
    };
  });

  return res.status(200).json({
    results,
    total: docsTotal,
    totalMissing: totalMissing,
    totalExpiring: expiringCount,
    totalExpired: expiredCount,
    totalValid: validCount,
    startRange: docsTotal ? skip + 1 : 0,
    endRange: skip + results.length,
  });
});

// Sync documents from external provider by vehicle number
export const syncDocumentsFromProvider = asyncHandler(async (req, res) => {
  const { vehicleNo } = req.body || {};
  if (!vehicleNo) {
    return res.status(400).json({ message: 'vehicleNo is required' });
  }

  // Ensure Vehicle API integration is enabled for this tenant
  const tenant = await Tenant.findById(req.tenant).select('integrations');
  const enabled = tenant?.integrations?.vehicleApi?.enabled;
  if (!enabled) {
    return res.status(400).json({ message: 'Vehicle API integration is not enabled for this tenant' });
  }

  // Find target vehicle (own vehicles only)
  const vehicle = await Vehicle.findOne({ tenant: req.tenant, vehicleNo, isOwn: true }).select('_id vehicleNo');
  if (!vehicle) {
    return res.status(404).json({ message: 'Vehicle not found or not owned' });
  }

  // Fetch latest details from provider
  let raw;
  try {
    raw = await fetchVehicleByNumber(vehicleNo);
  } catch (err) {
    return res.status(502).json({ message: 'Failed to fetch from provider', error: err.message });
  }

  const docs = extractDocuments(raw) || [];
  if (!Array.isArray(docs) || docs.length === 0) {
    return res.status(200).json({ addedCount: 0 });
  }

  // Prepare operations: deactivate previous active doc per type, then insert new active record
  const uniqueByType = new Map();
  for (const d of docs) {
    if (!d?.docType) continue;
    // Only keep first occurrence per type
    if (!uniqueByType.has(d.docType)) uniqueByType.set(d.docType, d);
  }

  const ops = [];
  const toInsert = [];
  for (const d of uniqueByType.values()) {
    ops.push({
      updateMany: {
        filter: { tenant: req.tenant, vehicle: vehicle._id, docType: d.docType, isActive: true },
        update: { $set: { isActive: false } },
      },
    });
    toInsert.push({
      tenant: req.tenant,
      vehicle: vehicle._id,
      docType: d.docType,
      ...(d.docNumber ? { docNumber: d.docNumber } : {}),
      issuer: d.issuer || undefined,
      issueDate: d.issueDate ? new Date(d.issueDate) : undefined,
      expiryDate: d.expiryDate ? new Date(d.expiryDate) : undefined,
      createdBy: req.user._id,
      isActive: true,
    });
  }

  if (toInsert.length) {
    // Execute deactivations first
    if (ops.length) {
      try { await VehicleDocument.bulkWrite(ops, { ordered: false }); } catch (e) { /* non-blocking */ }
    }
    // Insert new records
    try {
      const result = await VehicleDocument.insertMany(toInsert, { ordered: false });
      return res.status(200).json({ addedCount: Array.isArray(result) ? result.length : toInsert.length });
    } catch (err) {
      // On partial failures, report best-effort count
      return res.status(200).json({ addedCount: toInsert.length });
    }
  }

  return res.status(200).json({ addedCount: 0 });
});
