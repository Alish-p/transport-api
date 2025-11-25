# Purchase Order Module Documentation

This document explains all Purchase Order related functionality in the backend, including:
- Data models
- Status flow and business rules
- Permissions
- API endpoints for Purchase Orders

Base path for this module (from `routes/index.js`):  
`/api/purchase-orders`

All endpoints are tenant-scoped via the `authenticate` middleware, which sets `req.tenant` and `req.user`.

---

## Data Models

### PurchaseOrder

File: `entities/purchaseOrder/purchaseOrder.model.js`

Represents a Purchase Order for fleet parts raised to a vendor, scoped to a tenant and a specific inventory location.

Fields:
- `vendor` (`ObjectId`, required, ref: `Vendor`): Vendor receiving the order.
- `partLocation` (`ObjectId`, required, ref: `PartLocation`): Inventory / godown where parts will be received.
- `status` (`String`, required, enum):
  - Underlying values (from `PURCHASE_ORDER_STATUS`):
    - `"pending-approval"` — Newly created PO awaiting approval.
    - `"approved"` — Approved by an authorized user; not yet marked as paid.
    - `"purchased"` — Marked as paid / purchased (payment initiated or completed).
    - `"rejected"` — Rejected during approval.
    - `"received"` — All ordered quantities have been received into stock.
- `lines` (`Array` of line items, required):
  - Sub-document schema:
    - `part` (`ObjectId`, required, ref: `Part`): Part being ordered.
    - `quantityOrdered` (`Number`, required, `>= 0`): Quantity ordered from the vendor.
    - `quantityReceived` (`Number`, default `0`, `>= 0`): Quantity received so far (used for stock updates).
    - `unitCost` (`Number`, required, `>= 0`): Cost per unit.
    - `amount` (`Number`, required, `>= 0`): Line total = `quantityOrdered * unitCost`.
  - Validation: At least one line is required.
- `description` (`String`, optional): Free-text notes / description for the PO.

Financial fields:
- `subtotal` (`Number`, required, `>= 0`):
  - Computed as sum of all line `amount` values.
- `discountType` (`String`, enum, default `"fixed"`):
  - From `PURCHASE_ORDER_DISCOUNT_TYPES`:
    - `"percentage"` — `discount` is interpreted as a percentage of `subtotal`.
    - `"fixed"` — `discount` is interpreted as a fixed amount.
- `discount` (`Number`, default `0`, `>= 0`):
  - Interpreted depending on `discountType`.
  - Discount amount will never exceed `subtotal`.
- `shipping` (`Number`, default `0`, `>= 0`): Shipping/freight charges added after discount.
- `taxType` (`String`, enum, default `"fixed"`):
  - From `PURCHASE_ORDER_TAX_TYPES`:
    - `"percentage"` — `tax` is a percentage of `(subtotal - discountAmount)`.
    - `"fixed"` — `tax` is a fixed amount.
- `tax` (`Number`, default `0`, `>= 0`):
  - Interpreted based on `taxType`.
- `total` (`Number`, required, `>= 0`):
  - `total = (subtotal - discountAmount) + taxAmount + shipping`.

Audit fields:
- `createdBy` (`ObjectId`, required, ref: `User`): User who created the PO.
- `approvedBy` (`ObjectId`, ref: `User`): User who approved / rejected the PO.
- `purchasedBy` (`ObjectId`, ref: `User`): User who marked the PO as paid / purchased.
- `approvedAt` (`Date`, optional): Timestamp of approval / rejection.
- `purchasedAt` (`Date`, optional): Timestamp when marked as purchased.
- `receivedAt` (`Date`, optional): Timestamp when all items were fully received.
- `rejectionReason` (`String`, optional): Optional reason when PO is rejected.
- `paymentReference` (`String`, optional): Reference number / note for payment.
- `tenant` (`ObjectId`, required, ref: `Tenant`): Tenant context.

Indexes:
- `{ tenant, vendor, createdAt }` for efficient vendor-wise listing.
- `status` is indexed for filtering by status.

---

### Constants

File: `entities/purchaseOrder/purchaseOrder.constants.js`

- `PURCHASE_ORDER_STATUS`
  - `PENDING_APPROVAL: "pending-approval"`
  - `APPROVED: "approved"`
  - `PURCHASED: "purchased"`
  - `REJECTED: "rejected"`
  - `RECEIVED: "received"`

- `PURCHASE_ORDER_DISCOUNT_TYPES`
  - `PERCENTAGE: "percentage"`
  - `FIXED: "fixed"`

- `PURCHASE_ORDER_TAX_TYPES`
  - `PERCENTAGE: "percentage"`
  - `FIXED: "fixed"`

- `PURCHASE_ORDER_SEARCH_FIELDS`
  - Currently `['description']` (reserved for future text search).

---

## Status Flow & Business Rules

Typical lifecycle:
1. **Create PO**
   - Initial `status = "pending-approval"`.
   - Only users with `purchaseOrder.create` permission can create POs.
2. **Approve / Reject**
   - Only POs in `"pending-approval"` can be approved or rejected.
   - Approve:
     - `status` → `"approved"`.
     - Sets `approvedBy` and `approvedAt`.
   - Reject:
     - `status` → `"rejected"`.
     - Sets `approvedBy`, `approvedAt`, and optional `rejectionReason`.
3. **Mark as Paid / Purchased**
   - Only POs in `"approved"` state can be marked as paid.
   - On success:
     - `status` → `"purchased"`.
     - Sets `purchasedBy` and `purchasedAt`.
     - Optional `paymentReference`.
4. **Receive Items**
   - Only POs in `"approved"` or `"purchased"` can be received.
   - Body carries per-line `quantityReceived` updates (cumulative).
   - For each line:
     - Cannot reduce `quantityReceived`.
     - Cannot exceed `quantityOrdered`.
   - For each *increment* in `quantityReceived`, the corresponding `Part.quantity` is incremented.
   - When **all** lines are fully received:
     - `status` → `"received"`.
     - Sets `receivedAt`.

Edit restrictions:
- Header/line edit (`PUT /:id`):
  - Not allowed when `status` is `"received"` or `"rejected"`.
  - Not allowed if any line already has `quantityReceived > 0` (even if status is still `"approved"` or `"purchased"`).
- Delete:
  - Not implemented to preserve audit trail; use `reject` to cancel instead of deleting.

---

## Permissions

Permissions live on the User model: `entities/user/user.model.js` in the `permissions` object.

For the Purchase Order module, a dedicated permission block is added:

```js
permissions: {
  purchaseOrder: {
    create: Boolean,
    view: Boolean,
    update: Boolean,
    delete: Boolean,
    approve: Boolean, // special action for approve/reject
  },
  // ...
}
```

Usage in routes:
- Create PO: `checkPermission('purchaseOrder', 'create')`
- Update header/lines / mark as paid / receive: `checkPermission('purchaseOrder', 'update')`
- Approve or Reject: `checkPermission('purchaseOrder', 'approve')`
- List / Get by ID: currently only require authentication (`authenticate`), not explicit `view` checks.

Note: Make sure your UI / admin tools set these permissions for the required users.

---

## Common Behaviors

- **Authentication**
  - All routes use `authenticate`.
  - Middleware validates JWT, sets `req.user` and `req.tenant`.

- **Tenant Scoping**
  - All queries include `tenant: req.tenant`.
  - Vendors, PartLocations, and Parts are validated to belong to the same tenant.

- **Pagination**
  - Listing endpoint uses `pagination` middleware, which attaches `req.pagination = { limit, skip }`.

- **Stock Updates**
  - Stock (`Part.quantity`) is **only** adjusted in `/receive` endpoint.
  - On each incremental receive:
    - `Part.quantity` is increased by the **delta** between new and previous `quantityReceived` per line.
  - If a line is fully received (`quantityReceived === quantityOrdered`), further increments are rejected.

---

## API Endpoints

All routes are defined in `entities/purchaseOrder/purchaseOrder.routes.js`.

Base path: `/api/purchase-orders`

### 1. Create Purchase Order

- **Method**: `POST`
- **URL**: `/api/purchase-orders`
- **Auth**: `authenticate`
- **Permissions**: `checkPermission('purchaseOrder', 'create')`
- **Validation**: `purchaseOrderCreateSchema` (Zod)
- **Body**:

```json
{
  "vendor": "<vendorId>",
  "partLocation": "<partLocationId>",
  "description": "Optional notes",
  "lines": [
    {
      "part": "<partId>",
      "quantityOrdered": 10,
      "unitCost": 500
    }
  ],
  "discountType": "percentage",
  "discount": 5,
  "shipping": 200,
  "taxType": "percentage",
  "tax": 18
}
```

- **Response** `201 Created`:
  - Newly created `PurchaseOrder` document with:
    - `status = "pending-approval"`
    - `subtotal`, `total` computed on the server.

Notes:
- Vendor, PartLocation, and all Parts must belong to the same tenant.
- `lines[].amount` is computed as `quantityOrdered * unitCost`.

---

### 2. List Purchase Orders (with Filters)

- **Method**: `GET`
- **URL**: `/api/purchase-orders`
- **Auth**: `authenticate`
- **Permissions**: none (only authentication)
- **Query Parameters**:
  - `vendor` (optional, string or array): Filter by vendor id(s).
  - `status` (optional, string or array): Filter by one or more statuses (`"pending-approval"`, `"approved"`, `"purchased"`, `"rejected"`, `"received"`).
  - `fromDate` (optional, ISO string): Filter by `createdAt >= fromDate`.
  - `toDate` (optional, ISO string): Filter by `createdAt <= toDate`.
  - Pagination:
    - `page`, `rowsPerPage` as expected by `pagination` middleware.

- **Response** `200 OK`:

```json
{
  "purchaseOrders": [ /* PurchaseOrder[] */ ],
  "total": 25,
  "startRange": 1,
  "endRange": 10
}
```

Notes:
- Results are sorted by `createdAt` descending (latest first).
- Populates `vendor` and `partLocation` with basic details.

---

### 3. Get Purchase Order by ID

- **Method**: `GET`
- **URL**: `/api/purchase-orders/:id`
- **Auth**: `authenticate`
- **Permissions**: none (only authentication)

Path params:
- `id`: Purchase Order `_id`.

Responses:
- `200 OK`: Full `PurchaseOrder` document with populated:
  - `vendor` (name, phone, address, bankDetails).
  - `partLocation` (name, address).
  - `lines.part` (basic part details).
- `404 Not Found`: If PO does not exist for the tenant.

---

### 4. Edit Purchase Order (Header / Lines)

- **Method**: `PUT`
- **URL**: `/api/purchase-orders/:id`
- **Auth**: `authenticate`
- **Permissions**: `checkPermission('purchaseOrder', 'update')`

Allowed changes:
- `vendor`, `partLocation` (re-validated for tenant).
- `description`.
- `lines` (replaces the entire line array).
- `discountType`, `discount`, `shipping`, `taxType`, `tax`.

Business rules:
- Cannot edit if:
  - `status` is `"received"` or `"rejected"`.
  - **Any** existing line has `quantityReceived > 0`.

Responses:
- `200 OK`: Updated `PurchaseOrder` with recomputed `subtotal` and `total`.
- `400 Bad Request`: If edit is not allowed due to status/received quantities.
- `404 Not Found`: If PO not found for tenant.

---

### 5. Approve Purchase Order

- **Method**: `PUT`
- **URL**: `/api/purchase-orders/:id/approve`
- **Auth**: `authenticate`
- **Permissions**: `checkPermission('purchaseOrder', 'approve')`

Behavior:
- Only allowed when `status = "pending-approval"`.
- Sets:
  - `status = "approved"`.
  - `approvedBy = req.user._id`.
  - `approvedAt = now`.

Responses:
- `200 OK`: Updated PO.
- `400 Bad Request`: If PO is not in `"pending-approval"` state.
- `404 Not Found`: If PO not found for tenant.

---

### 6. Reject Purchase Order

- **Method**: `PUT`
- **URL**: `/api/purchase-orders/:id/reject`
- **Auth**: `authenticate`
- **Permissions**: `checkPermission('purchaseOrder', 'approve')`

Body (optional):

```json
{
  "reason": "Duplicate order"
}
```

Behavior:
- Only allowed when `status = "pending-approval"`.
- Sets:
  - `status = "rejected"`.
  - `approvedBy`, `approvedAt`.
  - `rejectionReason` (if provided).

Responses:
- `200 OK`: Updated PO.
- `400 Bad Request`: If PO is not in `"pending-approval"` state.
- `404 Not Found`: If PO not found for tenant.

---

### 7. Mark as Paid / Purchased

- **Method**: `PUT`
- **URL**: `/api/purchase-orders/:id/pay`
- **Auth**: `authenticate`
- **Permissions**: `checkPermission('purchaseOrder', 'update')`
- **Validation**: `purchaseOrderPaySchema`

Body:

```json
{
  "paymentReference": "NEFT-123456",
  "paymentDate": "2025-01-01T10:00:00.000Z"
}
```

Behavior:
- Only allowed when `status = "approved"`.
- Sets:
  - `status = "purchased"`.
  - `purchasedBy`, `purchasedAt` (uses `paymentDate` or `now`).
  - `paymentReference` (optional).

Responses:
- `200 OK`: Updated PO.
- `400 Bad Request`: If PO is not in `"approved"` state.
- `404 Not Found`: If PO not found for tenant.

---

### 8. Receive Items (Ordered vs Actual)

- **Method**: `PUT`
- **URL**: `/api/purchase-orders/:id/receive`
- **Auth**: `authenticate`
- **Permissions**: `checkPermission('purchaseOrder', 'update')`
- **Validation**: `purchaseOrderReceiveSchema`

Body:

```json
{
  "lines": [
    {
      "lineId": "<lineSubdocumentId>",
      "quantityReceived": 5
    }
  ]
}
```

Behavior:
- Only allowed when `status` is `"approved"` or `"purchased"`.
- For each line:
  - Cannot reduce previously received quantity.
  - Cannot exceed `quantityOrdered`.
  - For positive delta, increments `Part.quantity` accordingly.
- If **all** lines are fully received:
  - `status = "received"`.
  - `receivedAt` is set to current timestamp.

Responses:
- `200 OK`: Updated PO with updated line `quantityReceived` values and status.
- `400 Bad Request`:
  - If invalid quantity adjustments (decrease or exceed ordered).
  - If no changes detected.
  - If status not in allowed states.
- `404 Not Found`: If PO not found for tenant.

---

This completes the Purchase Order module with:
- Tenant-scoped POs
- Clear status workflow (Pending → Approved → Purchased → Received / Rejected)
- Stock integration via Part quantities
- Strict edit rules after receiving

Use this as the basis for your vehicle maintenance inventory UI. 

