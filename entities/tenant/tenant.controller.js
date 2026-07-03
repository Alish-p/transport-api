import asyncHandler from 'express-async-handler';

import Tenant from './tenant.model.js';
import { generateUploadUrl, buildPublicFileUrl, deleteObjectFromS3, buildDatedFilename } from '../../services/s3.service.js';

function sanitizeSegment(input, toLower = true) {
  const str = String(input || '')
    .normalize('NFKD')
    .replace(/[^\w\-\s.]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return toLower ? str.toLowerCase() : str;
}

// Note: Superuser-only create/list/delete/payment handlers moved to
// entities/superuser/superuser.controller.js

// Fetch Tenant by ID
const fetchTenantById = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findById(req.tenant);

  if (!tenant) {
    res.status(404).json({ message: "Tenant not found" });
    return;
  }

  res.status(200).json(tenant);
});

// Update Tenant
const updateTenant = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findByIdAndUpdate(req.tenant, req.body, {
    new: true,
  });
  res.status(200).json(tenant);
});

// Tenant-scoped delete is not exposed; superuser delete moved to superuser controller

// ====== Branding: Tenant Logo ======

// GET presigned URL for logo upload
const getLogoUploadUrl = asyncHandler(async (req, res) => {
  const { contentType, extension } = req.query;

  const allowedExt = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
  const allowedContent = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

  if (!contentType || !allowedContent.includes(String(contentType))) {
    return res.status(400).json({ message: 'Invalid or missing contentType (png/jpeg/webp/svg only)' });
  }
  if (!extension) {
    return res.status(400).json({ message: 'extension is required (png|jpg|jpeg|webp|svg)' });
  }
  const safeExt = String(extension).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!allowedExt.includes(safeExt)) {
    return res.status(400).json({ message: 'Invalid extension (png|jpg|jpeg|webp|svg only)' });
  }

  const tenantDoc = await Tenant.findById(req.tenant).select('name slug');
  if (!tenantDoc) return res.status(404).json({ message: 'Tenant not found' });

  const tenantSegment = sanitizeSegment(tenantDoc.slug || tenantDoc.name || 'tenant', true);
  const filename = buildDatedFilename('logo', safeExt);

  try {
    const result = await generateUploadUrl({
      tenantSegment,
      contentType,
      pattern: 'tenant-logo',
      filename
    });
    return res.status(200).json({ key: result.key, uploadUrl: result.uploadUrl });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create upload URL', error: err.message });
  }
});

// PUT set/remove logo for current tenant
const setTenantLogo = asyncHandler(async (req, res) => {
  const { fileKey } = req.body; // string to set, or null to remove

  const tenant = await Tenant.findById(req.tenant);
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

  const prevKey = tenant.logoKey;

  if (fileKey === null) {
    // Remove logo
    tenant.logoKey = null;
    tenant.logoUrl = null;
    tenant.logoUpdatedAt = new Date();
    await tenant.save();
    // Best-effort delete old
    if (prevKey) {
      try { await deleteObjectFromS3(prevKey); } catch (e) { /* non-blocking */ }
    }
    return res.status(200).json(tenant);
  }

  if (!fileKey || typeof fileKey !== 'string') {
    return res.status(400).json({ message: 'fileKey must be a non-empty string or null' });
  }

  // Set/update logo
  // Build public URL:
  // - If a CDN base is configured (CloudFront with Origin Path /logos),
  //   strip the leading 'logos/' from the key for the public path.
  // - Otherwise, fall back to S3 domain via buildPublicFileUrl (keeps 'logos/' in path).
  const base = process.env.AWS_PUBLIC_BASE_URL;
  const publicKey = String(fileKey).replace(/^logos\//, '');
  const url = base
    ? `${base.replace(/\/$/, '')}/${publicKey}`
    : (buildPublicFileUrl(fileKey) || null);
  tenant.logoKey = fileKey;
  tenant.logoUrl = url;
  tenant.logoUpdatedAt = new Date();
  await tenant.save();

  // Best-effort delete previous object
  if (prevKey && prevKey !== fileKey) {
    try { await deleteObjectFromS3(prevKey); } catch (e) { /* non-blocking */ }
  }

  return res.status(200).json(tenant);
});


export {
  updateTenant,
  setTenantLogo,
  fetchTenantById,
  getLogoUploadUrl,
};

// Superuser-only fetch by id moved to superuser controller
