Generic GST Lookup

- Route: POST `/api/lookup/gst`
- Auth: Bearer token required (no extra permission gate)
- Tenant integration: requires `integrations.gstApi.enabled = true`

Env
- `GST_API_URL` (optional) defaults to `https://api.webcorevision.com:3000/api/MeitYGST`
- `GST_API_KEY` required

Request
```
{
  "gstin": "29AABCJ0355R1Z3"
}
```

Response
```
{
  "response": { /* provider response object */ },
  "responseStatus": "SUCCESS",
  "message": null,
  "canonical": {
    gstin: string,
    pan: string | null,
    tradeName: string | null,
    legalName: string | null,
    status: string | null,
    constitution: string | null,
    dateOfRegistration: string | null,
    address: {
      line1: string | null,
      buildingNumber: string | null,
      streetName: string | null,
      location: string | null,
      district: string | null,
      state: string | null,
      city: string | null,
      pincode: string | null,
      latitude: string | null,
      longitude: string | null,
    }
  }
}
```

Notes
- `response` is the provider payload you can map as needed on the client.
- `canonical` is an optional, provider-agnostic summary for easy UI prefill.
- Server does no entity-specific mapping; UI decides how to use the data.
