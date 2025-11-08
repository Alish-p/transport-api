Tenant Branding: Logo Upload

Overview

- Each tenant can upload a single logo.
- Logo is returned via GET `/api/tenants/mytenant` as `logoUrl` and `logoKey`.
- Upload uses S3 presigned PUT. Serve via public CDN/base URL for fast access.

Environment

- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `AWS_PUBLIC_BASE_URL` (recommended CloudFront domain for public access)
  - If set, public URLs are built as `${AWS_PUBLIC_BASE_URL}/${key}`.
  - Best practice: configure CloudFront with Origin Access Control (OAC) pointing to the private S3 bucket.

Routes (under `/api/tenants`)

- GET `/branding/logo/upload-url?contentType=image/png&extension=png`
  - Requires `authenticate` + `checkPermission('tenant','update')`.
  - Returns `{ key, uploadUrl }` (valid ~15 min).
  - Client must upload with the same `Content-Type` header.
  - Allowed types: png, jpg, jpeg, webp, svg.

- PUT `/branding/logo`
  - Requires `authenticate` + `checkPermission('tenant','update')`.
  - Body to set: `{ fileKey: string }`. Body to remove: `{ fileKey: null }`.
  - Persists `logoKey`, computes `logoUrl` using `AWS_PUBLIC_BASE_URL` or S3 domain, sets `logoUpdatedAt`.
  - Best-effort deletes previous logo object from S3.

Returned by `/api/tenants/mytenant`

- Fields: `logoKey`, `logoUrl`, `logoUpdatedAt`.

Security & Caching

- Recommended: keep bucket private, expose public logo URLs via CloudFront (OAC) and set `AWS_PUBLIC_BASE_URL` to the CloudFront domain.
- If serving via S3 directly, ensure objects are publicly readable (bucket policy) for the logo prefix.
- For client caching, you can append `?v=<timestamp>` using `logoUpdatedAt` or document `updatedAt`.

Upload Flow

1. Client requests presigned PUT URL.
2. Client uploads file to S3 using the returned URL with the same `Content-Type`.
3. Client calls `PUT /branding/logo` with `{ fileKey }` to save.

Object Key Structure

- Storage key (S3): `logos/<tenantSlugOrName>/logo_YYYY-MM-DD_rand4.<ext>`
  - Example: `logos/mayur-logistics/logo_2025-11-08_77e7.svg`
- Public URL (CloudFront, Origin Path = `/logos`): `https://<CDN_DOMAIN>/<tenantSlugOrName>/logo_...`
  - Example: `https://cdn.example.com/mayur-logistics/logo_2025-11-08_77e7.svg`
  - Note: the `logos/` prefix is NOT present in the public URL because CloudFront Origin Path supplies it.

Implementation details
- The API stores `logoKey` as the full S3 key including the `logos/` prefix.
- When `AWS_PUBLIC_BASE_URL` is set, the server removes the leading `logos/` when generating `logoUrl` so it matches your CloudFront mapping.
