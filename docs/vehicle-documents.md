Vehicle Documents API

Overview
- Manage per-vehicle documents (Insurance, PUC, RC, Fitness, Permit, Tax, Other).
- One active document per vehicle per type. Older uploads auto-archive.
- S3-backed storage with presigned upload.
 - docNumber is optional across document types.
 - When using Vehicle Lookup integration, missing issueDate defaults to today.

Environment
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
- `AWS_PUBLIC_BASE_URL` (optional CDN/bucket base for public file URLs)

Routes (all under `/api/vehicles` unless stated)
- GET `/:vehicleId/documents/upload-url?docType=Insurance&contentType=application/pdf&extension=pdf`
  - Returns `{ key, uploadUrl }` for direct S3 PUT.
- POST `/:vehicleId/documents`
  - Body: `{ docType, docNumber, issueDate?, expiryDate?, fileKey }`
  - Creates/activates a new document record; previous active of same type is deactivated.
  - Note: `docNumber` is optional.
- GET `/documents/pagination`
  - Paginated list with filters and status totals.
  - Query params:
    - `page`, `rowsPerPage`
    - `status`: one of `missing`, `expiring`, `expired`, `valid`
    - `vehicleId`
    - `documentType` (alias: `docType`)
    - `expiryFrom`, `expiryTo`
    - `issueFrom`, `issueTo`
    - `createdBy` (user id)
    - `docNumber` (search)
    - `issuer` (search)
    - `days` (expiring window, default 30)
  - Response shape:
    - `{ results, total, totalMissing, totalExpiring, totalExpired, totalValid, startRange, endRange }`
 - GET `/:vehicleId/documents/:docId/download`
  - Returns `{ url, expiresIn }` short-lived presigned GET for private buckets.
 - PUT `/:vehicleId/documents/:docId`
  - Update fields: `{ docNumber?, issueDate?, expiryDate?, isActive?, docType?, issuer? }`.
  - If `isActive` is true (or remains true) and `docType` is set/unchanged, any other active doc of same type is auto-deactivated.
- DELETE `/:vehicleId/documents/:docId`
  - Deletes the document record and attempts to delete the S3 object (best-effort). API still succeeds if S3 delete fails, returning `s3Deleted: false` and an `s3Error` message.

Sync From Provider (under `/api/documents`)
- POST `/sync`
  - Body: `{ vehicleNo }`
  - Requires Vehicle API integration to be enabled for the tenant.
  - Finds the own vehicle by number, fetches current document details from the provider, deactivates any existing active documents of the same type, and creates new active records.
  - Response: `{ addedCount }` indicating how many documents were created.

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
- `<tenant>/vehicles/<vehicleNo>/<docType>/<docType>_<YYYY-MM-DD>_<rand4>.<ext>`
  - Example: `acme/vehicles/GJ01AB1234/insurance/insurance_2025-10-20_ab12.pdf`
  - `ext` is provided by the client via the `extension` (or `ext`) query param.
Auto-creation on Vehicle Create
- If the Vehicle API integration is enabled and a prior `/api/vehicles/lookup` was performed for this vehicle number, the server will best-effort create documents for: RC, Insurance, PUC, Fitness, Permit, Tax with available details from the snapshot.
