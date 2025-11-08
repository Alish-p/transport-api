import asyncHandler from 'express-async-handler';
import Tenant from './tenant.model.js';
import { buildPublicFileUrl, createPresignedPutUrl, deleteObjectFromS3 } from '../../services/s3.service.js';

function sanitizeSegment(input, toLower = true) {
  const str = String(input || '')
    .normalize('NFKD')
    .replace(/[^\w\-\s.]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return toLower ? str.toLowerCase() : str;
}

// Create Tenant
const createTenant = asyncHandler(async (req, res) => {
  const tenant = new Tenant({ ...req.body });
  const newTenant = await tenant.save();
  res.status(201).json(newTenant);
});

// Fetch Tenants with pagination and search
const fetchTenants = asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;
    const { limit, skip } = req.pagination;

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
      ];
    }

    const [tenants, total] = await Promise.all([
      Tenant.find(query).sort({ name: 1 }).skip(skip).limit(limit),
      Tenant.countDocuments(query),
    ]);

    res.status(200).json({
      tenants,
      total,
      startRange: skip + 1,
      endRange: skip + tenants.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "An error occurred while fetching paginated tenants",
      error: error.message,
    });
  }
});

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

// Delete Tenant
const deleteTenant = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenant = await Tenant.findByIdAndDelete(id);
  res.status(200).json(tenant);
});

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

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand4 = Math.random().toString(36).slice(2, 6);
  const filename = `logo_${yyyy}-${mm}-${dd}_${rand4}.${safeExt}`;

  // Store under top-level logos/ for CloudFront origin path mapping
  const key = `logos/${tenantSegment}/${filename}`;

  try {
    const uploadUrl = await createPresignedPutUrl({ key, contentType, expiresIn: 900 });
    return res.status(200).json({ key, uploadUrl });
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
  createTenant,
  fetchTenants,
  fetchTenantById,
  updateTenant,
  deleteTenant,
  getLogoUploadUrl,
  setTenantLogo
};
