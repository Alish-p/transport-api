Challan API (eChallan)

- Auth: Bearer token required
- Permission: `vehicle:view`

Endpoints

- GET `/challans?vehicleNo=KA22AA0372`
  - Returns challans from DB only, never calls provider.
  - Also returns `lastFetchedAt` and `nextAllowedAt` for 10‑day refetch window.

- POST `/challans/sync`
  - Body: `{ "vehicleNo": "KA22AA0372" }` (alias: `vehiclenumber`)
  - Calls provider and upserts results into DB.
  - Enforces 10‑day cooldown; if within window, returns 429 + cached results and timing.

Behavior

- Only allowed for vehicles owned by the tenant (`Vehicle.isOwn === true`).
- Only available if `Tenant.integrations.challanApi.enabled` is `true`.
- One provider call per vehicle per 10 days (cooldown).

Storage

- Upserts challans into `Challan` collection (unique per tenant+challanNo).
- Persists a `ChallanLookup` snapshot per fetch for cooldown tracking.

Env vars

- `CHALLAN_API_URL` (default: `https://api.webcorevision.com:3000/api/eChallan`)

Sample responses

- GET `/challans?vehicleNo=KA22AA0372`
```
{
  "vehicleNo": "KA22AA0372",
  "lastFetchedAt": "2025-04-16T16:12:00.000Z",
  "nextAllowedAt": "2025-04-26T16:12:00.000Z",
  "pendingCount": 1,
  "disposedCount": 0,
  "results": { "pending": [/* challans */], "disposed": [] }
}
```

- POST `/challans/sync` (success)
```
{
  "vehicleNo": "KA22AA0372",
  "lastFetchedAt": "2025-04-16T16:12:00.000Z",
  "nextAllowedAt": "2025-04-26T16:12:00.000Z",
  "pendingCount": 1,
  "disposedCount": 0,
  "results": { "pending": [/* normalized items */], "disposed": [] }
}
```

- POST `/challans/sync` (within cooldown)
```
{
  "message": "Challan fetch is limited to once every 10 days for a vehicle",
  "lastFetchedAt": "2025-04-16T16:12:00.000Z",
  "nextAllowedAt": "2025-04-26T16:12:00.000Z",
  "cached": true,
  "results": [/* challans from DB */]
}
```
