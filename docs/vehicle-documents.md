Vehicle Documents API

Overview
- Manage per-vehicle documents (Insurance, PUC, RC, Fitness, Permit, Tax, Other).
- One active document per vehicle per type. Older uploads auto-archive.
- S3-backed storage with presigned upload.

Environment
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
- `AWS_PUBLIC_BASE_URL` (optional CDN/bucket base for public file URLs)

Routes (all under `/api/vehicles` unless stated)
- GET `/:vehicleId/documents/upload-url?docType=Insurance&contentType=application/pdf`
  - Returns `{ key, uploadUrl }` for direct S3 PUT.
- POST `/:vehicleId/documents`
  - Body: `{ docType, docNumber, issueDate?, expiryDate?, fileKey }`
  - Creates/activates a new document record; previous active of same type is deactivated.
- GET `/:vehicleId/documents/active`
  - Lists active documents for a vehicle.
- GET `/:vehicleId/documents/history?docType=Insurance`
  - Lists history of documents (optionally filter by type).
- GET `/:vehicleId/documents/missing`
  - Returns required types and which are missing an active doc.
- GET `/documents/expiring?from=2024-10-01&to=2025-01-01`
  - Tenant-wide expiring active documents; supports `vehicleId` and `docType` filters.
 - GET `/:vehicleId/documents/:docId/download`
  - Returns `{ url, expiresIn }` short-lived presigned GET for private buckets.
 - PUT `/:vehicleId/documents/:docId`
  - Update fields: `{ docNumber?, issueDate?, expiryDate?, isActive?, docType? }`.
  - If `isActive` is true (or remains true) and `docType` is set/unchanged, any other active doc of same type is auto-deactivated.
 - DELETE `/:vehicleId/documents/:docId`
  - Deletes the document record only (file remains in S3). Optional S3 delete can be added if required.

Security
- All routes require `authenticate`.
- Upload/create require `checkPermission('vehicle','update')`.
- Reads require `checkPermission('vehicle','read')`.
- Tenant-scoped queries enforced via `tenant` on each record.

Upload Flow
1) Client requests presigned URL.
2) Client PUTs the file to S3 using returned URL.
3) Client POSTs metadata with `fileKey` to create the record.

Object Key Structure
- `<tenantName>/vehicles/<vehicleNo>/<docType>/<timestamp>_<rand>`
