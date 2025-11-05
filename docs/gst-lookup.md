GST Lookup (Customer Prefill)

- Route: POST `/api/customers/gst-lookup`
- Auth: Requires authentication and `customer:view` permission
- Integration flag: `tenant.integrations.gstApi.enabled` must be true

Env
- `GST_API_URL` (optional) defaults to `https://api.webcorevision.com:3000/api/MeitYGST`
- `GST_API_KEY` required, provider token sent as `X-API-Key`

Request
```
{
  "gstin": "29AABCJ0355R1Z3"
}
```

Response
```
{
  "customer": {
    "customerName": "J K CEMENT WORKS MUDDAPUR (UNIT J K CEMENT LTD)",
    "GSTNo": "29AABCJ0355R1Z3",
    "gstEnabled": true,
    "PANNo": "AABCJ0355R",
    "address": "117-142, LOKAPUR - YADWAD ROAD, MUDDAPUR, Bagalkote",
    "state": "Karnataka",
    "pinCode": "587122"
  }
}
```

Notes
- `customerName` prefers tradeName, falls back to legalNameOfBusiness.
- `address` is composed from buildingNumber, streetName, location, districtName.
- PAN is derived from GSTIN (positions 3–12).
- Raw provider payload is not stored; this endpoint is meant for form prefill.

