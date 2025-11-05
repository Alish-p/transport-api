Vehicle Lookup API

Overview
- Prefills vehicle form by fetching details from an external provider (WebCoreVision).
- Persists a snapshot for later use when creating the vehicle and auto-creating documents.
- Only available when the tenant integration flag is enabled.

Prerequisites
- Enable integration on your tenant:

  curl -X PUT "http://localhost:5001/api/tenants/mytenant" \
    -H "Authorization: Bearer <JWT>" \
    -H "Content-Type: application/json" \
    -d '{
      "integrations": {
        "vehicleApi": { "enabled": true }
      }
    }'

- Optional env var: `VEHICLE_API_URL` to override the default provider URL.

Endpoint
- POST `/api/vehicles/lookup`
  - Auth: `Bearer <JWT>`; Permission: `checkPermission('vehicle','view')`
  - Body: `{ "vehicleNo": "KA48A4508" }`

Request

  curl -X POST "http://localhost:5001/api/vehicles/lookup" \
    -H "Authorization: Bearer <JWT>" \
    -H "Content-Type: application/json" \
    -d '{ "vehicleNo": "KA48A4508" }'

Response
- 200 OK
  {
    "vehicle": {
      "vehicleNo": "KA48A4508",
      "vehicleType": "HGV",
      "modelType": "1916 LPT DCR45HSD 160B6M5",
      "vehicleCompany": "Tata",
      "noOfTyres": 6,
      "chasisNo": "MAT843202R7K*****",
      "engineNo": "3.3LNGD11KVX5*****",
      "manufacturingYear": 2024,
      "loadingCapacity": 13.07,
      "engineType": "BS-6"
    },
    "documentsSuggested": [
      { "docType": "RC", "docNumber": "KA48A4508", "issuer": "JAMKHANDI  ARTO, Karnataka", "issueDate": "2024-11-07", "expiryDate": "2026-11-06" },
      { "docType": "Insurance", "docNumber": "610700312410003996", "issuer": "National Insurance Co. Ltd.", "issueDate": "2025-04-04", "expiryDate": "2025-11-04" },
      { "docType": "PUC", "docNumber": "Newv4", "issuer": null, "issueDate": "2025-11-04", "expiryDate": "2025-11-06" },
      { "docType": "Fitness", "docNumber": null, "issuer": null, "issueDate": "2025-11-04", "expiryDate": "2026-11-06" },
      { "docType": "Permit", "docNumber": "KA2024-GP-8039F", "issuer": "STATE TRANSPORT AUTHORITY", "issueDate": "2024-11-16", "expiryDate": "2029-11-15" },
      { "docType": "Tax", "docNumber": null, "issuer": null, "issueDate": "2025-11-04", "expiryDate": "2025-10-31" }
    ]
  }

Notes
- No. of tyres is estimated from axle count (2→6, 3→10, 4→14, 5+→18). Users can override.
- Loading capacity is derived in tons: `(rc_gvw - rc_unld_wt) / 1000`.
- Missing document issue dates default to today.

Creation Flow (auto-docs)
1) Call `/api/vehicles/lookup` to prefill the form.
2) Create the vehicle using the normalized fields.
3) If integration is enabled and the vehicle is own (isOwn=true), the server auto-creates documents from the last lookup snapshot.

Example: Create Vehicle

  curl -X POST "http://localhost:5001/api/vehicles" \
    -H "Authorization: Bearer <JWT>" \
    -H "Content-Type: application/json" \
    -d '{
      "vehicleNo": "KA48A4508",
      "vehicleType": "HGV",
      "modelType": "1916 LPT DCR45HSD 160B6M5",
      "vehicleCompany": "Tata",
      "noOfTyres": 6,
      "chasisNo": "MAT843202R7K*****",
      "engineNo": "3.3LNGD11KVX5*****",
      "manufacturingYear": 2024,
      "loadingCapacity": 13.07,
      "engineType": "BS-6",
      "isOwn": true
    }'

After creation
- Documents for RC, Insurance, PUC, Fitness, Permit, and Tax are created best-effort using the snapshot.
- `docNumber` is optional. Missing issueDate defaults to today.
