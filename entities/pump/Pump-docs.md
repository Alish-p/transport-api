# Pump Module Documentation

This document explains all Pump-related functionality in the backend, including:
- Data models
- Permissions
- API endpoints for Pumps
- API endpoints for Fuel Prices (per pump)

Base path for this module (from `routes/index.js`):  
`/api/pumps`

All endpoints are tenant-scoped via the `authenticate` middleware, which sets `req.tenant` and `req.user`.

---

## Data Models

### Pump

File: `entities/pump/pump.model.js`

Represents a fuel pump (petrol bunk) associated with a tenant.

Fields:
- `name` (`String`, required): Pump name (unique per tenant).
- `phone` (`String`, required): Contact phone number.
- `ownerName` (`String`, required): Pump owner name.
- `address` (`String`, required): Pump address.
- `bankDetails` (`Object`, required):
  - `name` (`String`, required): Bank name.
  - `branch` (`String`, required): Bank branch.
  - `ifsc` (`String`, required, uppercase): IFSC code.
  - `place` (`String`, required): Bank place / location.
  - `accNo` (`String`, required): Account number.
- `tenant` (`ObjectId`, required, ref: `Tenant`): Tenant who owns this pump.

Indexes:
- Unique index on `{ tenant, name }` to enforce one pump name per tenant.

---

### Fuel Price

File: `entities/pump/fuelPrice.model.js`

Represents the price of a particular fuel type for a specific pump over a date range.

Fields:
- `pump` (`ObjectId`, required, ref: `Pump`): Pump the price belongs to.
- `fuelType` (`String`, required, enum):
  - Supported values (from `FUEL_TYPES` in `pump.constants.js`):
    - `"Diesel"`
    - `"Petrol"`
    - `"CNG"`
- `price` (`Number`, required): Fuel price for the given period.
- `fromDate` (`Date`, required): Start date (inclusive) of the price validity.
- `toDate` (`Date`, required): End date (inclusive) of the price validity.
- `tenant` (`ObjectId`, required, ref: `Tenant`): Tenant context.

Indexes:
- Compound index `{ tenant, pump, fuelType, fromDate, toDate }` for efficient lookup by tenant/pump/fuel/date.

Overlapping date ranges for the same `pump + fuelType` are prevented by controller logic.

---

### Constants

File: `entities/pump/pump.constants.js`

- `PUMP_SEARCH_FIELDS`  
  - `['name']` – fields used for text search in Pump listing.

- `FUEL_TYPES`  
  - `['Diesel', 'Petrol', 'CNG']` – allowed fuel types for Fuel Price entries.

---

## Permissions

Permissions live on the User model: `entities/user/user.model.js` under `permissions.pump`.

For the Pump module, **one permission section** controls both:
- Pump operations (create/view/update/delete)
- Fuel Price operations (create/view/update/delete)

Structure:

```js
permissions: {
  pump: {
    create: Boolean,
    view: Boolean,
    update: Boolean,
    delete: Boolean,
  },
  // ...
}
```

Usage in routes:
- Create Pump + Create Fuel Price: `checkPermission('pump', 'create')`
- Update Pump + Update Fuel Price: `checkPermission('pump', 'update')`
- Delete Pump + Delete Fuel Price: `checkPermission('pump', 'delete')`
- View operations are currently guarded by authentication + tenant-scoping (no explicit `pump.view` check in routes).

---

## Common Behaviors

- **Authentication**  
  Every route in `pump.routes.js` uses `authenticate`.  
  The middleware:
  - Validates JWT.
  - Sets `req.user` and `req.tenant` (tenant ObjectId).

- **Tenant scoping**  
  All queries use `tenant: req.tenant`. The helper `addTenantToQuery` from `utils/tenant-utils.js` is used in list handlers.

- **Pagination**  
  Listing endpoints use `pagination` middleware, which attaches `req.pagination = { limit, skip }`.

---

## Pump APIs

All routes defined in `entities/pump/pump.routes.js`.

Base path: `/api/pumps`

### 1. Create Pump

- **Method**: `POST`
- **URL**: `/api/pumps`
- **Auth**: `authenticate`
- **Permissions**: `checkPermission('pump', 'create')`
- **Body**:
  ```json
  {
    "name": "ABC Pump",
    "phone": "9876543210",
    "ownerName": "Owner Name",
    "address": "Full address",
    "bankDetails": {
      "name": "Bank Name",
      "branch": "Branch Name",
      "ifsc": "IFSC0001",
      "place": "City",
      "accNo": "1234567890"
    }
  }
  ```
- **Response** `201 Created`:
  - Newly created Pump document (with `tenant` and timestamps).

Notes:
- Tenant is automatically set from `req.tenant`.
- Pump `name` must be unique within the tenant.

---

### 2. Get Pumps (List with Search + Pagination)

- **Method**: `GET`
- **URL**: `/api/pumps`
- **Auth**: `authenticate`
- **Permissions**: none (just authentication currently)
- **Query Parameters**:
  - `search` (optional, string): case-insensitive search on pump `name`.
  - Pagination:
    - `page`, `limit` (or whatever `pagination` middleware expects).

- **Response** `200 OK`:
  ```json
  {
    "pumps": [ /* Pump[] */ ],
    "total": 10,
    "startRange": 1,
    "endRange": 10
  }
  ```

Notes:
- Results are sorted by `name` ascending.
- All results are scoped to `req.tenant`.

---

### 3. Get Pump By ID

- **Method**: `GET`
- **URL**: `/api/pumps/:id`
- **Auth**: `authenticate`
- **Permissions**: none (just authentication currently)

Path parameters:
- `id`: Pump `_id`.

Responses:
- `200 OK`: Pump document if found for that tenant.
- `404 Not Found`: If no pump exists with that `id` for the current tenant.

---

### 4. Update Pump

- **Method**: `PUT`
- **URL**: `/api/pumps/:id`
- **Auth**: `authenticate`
- **Permissions**: `checkPermission('pump', 'update')`

Path parameters:
- `id`: Pump `_id`.

Body:
- Any updatable pump fields:
  - `name`, `phone`, `ownerName`, `address`, `bankDetails`.

Responses:
- `200 OK`: Updated Pump document.
- If pump does not belong to the tenant, result will be `null` (currently returns `null` with `200` – client should handle this case).

---

### 5. Delete Pump (and its Fuel Prices)

- **Method**: `DELETE`
- **URL**: `/api/pumps/:id`
- **Auth**: `authenticate`
- **Permissions**: `checkPermission('pump', 'delete')`

Path parameters:
- `id`: Pump `_id`.

Behavior:
- Deletes the Pump document for the current tenant.
- If the pump is found and deleted, deletes **all** associated Fuel Price records:
  - `FuelPrice.deleteMany({ pump: pump._id, tenant: req.tenant })`

Responses:
- `200 OK`: Deleted Pump document (or `null` if not found).

---

## Fuel Price APIs (Per Pump)

All fuel price endpoints share the same base router `/api/pumps` but work under a given pump:

Base prefix for these: `/api/pumps/:pumpId/fuel-prices`

### 6. Create Fuel Price

- **Method**: `POST`
- **URL**: `/api/pumps/:pumpId/fuel-prices`
- **Auth**: `authenticate`
- **Permissions**: `checkPermission('pump', 'create')`

Path parameters:
- `pumpId`: Pump `_id` to which the fuel price belongs.

Body:
```json
{
  "pump": "<pumpId>",
  "fuelType": "Diesel",        // or "Petrol" / "CNG"
  "price": 100.5,
  "fromDate": "2024-01-01",
  "toDate": "2024-01-31"
}
```

Behavior:
- Validates that the pump exists for the current tenant.
- Checks for overlapping entries for the same `pump + fuelType`:
  - Any existing record where date range intersects the new `[fromDate, toDate]`.
- If overlapping entry exists: returns `400` with a descriptive message.
- Otherwise, creates a new Fuel Price entry.

Responses:
- `201 Created`: Newly created FuelPrice document.
- `400 Bad Request`: Pump not found or overlapping date range.

---

### 7. Get Fuel Prices of a Pump

- **Method**: `GET`
- **URL**: `/api/pumps/:pumpId/fuel-prices`
- **Auth**: `authenticate`
- **Permissions**: none (just authentication currently)
- **Middlewares**: `pagination`

Path parameters:
- `pumpId`: Pump `_id`.

Query parameters:
- `fuelType` (optional): filter by `"Diesel" | "Petrol" | "CNG"`.
- `fromDate` (optional): filter to prices whose `toDate >= fromDate`.
- `toDate` (optional): filter to prices whose `fromDate <= toDate`.
- Pagination:
  - `page`, `limit` (from `pagination` middleware).

Responses:
- `200 OK`:
  ```json
  {
    "fuelPrices": [ /* FuelPrice[] with pump populated */ ],
    "total": 5,
    "startRange": 1,
    "endRange": 5
  }
  ```
- Each item has `pump` populated.

---

### 8. Fetch Current Price of a Fuel Type for a Pump

- **Method**: `GET`
- **URL**: `/api/pumps/:pumpId/fuel-prices/:fuelType/current`
- **Auth**: `authenticate`
- **Permissions**: none (just authentication currently)

Path parameters:
- `pumpId`: Pump `_id`.
- `fuelType`: `"Diesel" | "Petrol" | "CNG"`.

Query parameters:
- `date` (optional, ISO date string):  
  - If provided, uses that date.  
  - If omitted, uses the current date (`new Date()`).

Behavior:
- Looks for Fuel Price entries where:
  - `fromDate <= date <= toDate`
  - For the given `pumpId + fuelType + tenant`.
- If none found: returns `404`.
- If more than one found: returns `400` (data issue: overlapping entries).
- If exactly one found: returns that Fuel Price.

Responses:
- `200 OK`: Current Fuel Price document.
- `404 Not Found`: No price configured for that date.
- `400 Bad Request`: Multiple prices found (overlap).

---

### 9. Get Fuel Price by ID

- **Method**: `GET`
- **URL**: `/api/pumps/:pumpId/fuel-prices/:priceId`
- **Auth**: `authenticate`
- **Permissions**: none (just authentication currently)

Path parameters:
- `pumpId`: Pump `_id` (not used in query but kept for URL structure).
- `priceId`: FuelPrice `_id`.

Behavior:
- Finds a Fuel Price by `_id` and tenant, and populates `pump`.

Responses:
- `200 OK`: Fuel Price document (with `pump` populated).
- `404 Not Found`: If not found for that tenant.

---

### 10. Update Fuel Price

- **Method**: `PUT`
- **URL**: `/api/pumps/:pumpId/fuel-prices/:priceId`
- **Auth**: `authenticate`
- **Permissions**: `checkPermission('pump', 'update')`

Path parameters:
- `pumpId`: Pump `_id`.
- `priceId`: FuelPrice `_id`.

Body:
```json
{
  "pump": "<pumpId>",
  "fuelType": "Diesel",
  "price": 102.0,
  "fromDate": "2024-02-01",
  "toDate": "2024-02-28"
}
```

Behavior:
- Checks for overlapping entries for same `pump + fuelType`, excluding the current `priceId`.
- If overlapping entry exists: returns `400`.
- Otherwise, updates the record and returns the updated document (with `pump` populated).

Responses:
- `200 OK`: Updated Fuel Price document.
- `404 Not Found`: If the record does not exist for the tenant.
- `400 Bad Request`: Overlapping date range.

---

### 11. Delete Fuel Price

- **Method**: `DELETE`
- **URL**: `/api/pumps/:pumpId/fuel-prices/:priceId`
- **Auth**: `authenticate`
- **Permissions**: `checkPermission('pump', 'delete')`

Path parameters:
- `pumpId`: Pump `_id`.
- `priceId`: FuelPrice `_id`.

Behavior:
- Deletes the Fuel Price record for the current tenant.

Responses:
- `200 OK`:
  ```json
  { "message": "Fuel price deleted" }
  ```
- `404 Not Found`: If the price does not exist for the tenant.

---

## Summary

- Pump and Fuel Price are fully tenant-scoped and live under a single router: `/api/pumps`.
- A single permission section `permissions.pump` controls access for both pump details and fuel price management.
- Fuel prices are stored per pump, per fuel type, and per date range, with protections against overlapping ranges for the same pump and fuel type.

