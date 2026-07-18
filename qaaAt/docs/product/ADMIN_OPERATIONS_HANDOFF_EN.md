# QaaAt Minimum Admin Operations — Backend Handoff

Verified against the AdonisJS routes, validators, services, PostgreSQL migrations, OpenAPI metadata, and Japa contracts on **2026-07-18**.

All routes below require a bearer token issued to an active `admin` identity. Customer and company-app tokens receive `403`. These APIs are operational surfaces and must not be called by either mobile application.

## Controlled Space catalog

### Read the complete catalog

```http
GET /api/admin/catalog
```

Returns active and inactive category and amenity definitions:

```json
{
  "data": {
    "categories": [
      {
        "id": 1,
        "slug": "meeting_room",
        "nameAr": "غرفة اجتماعات",
        "nameEn": "Meeting room",
        "isActive": true,
        "sortOrder": 20,
        "createdAt": "...",
        "updatedAt": null
      }
    ],
    "amenities": []
  }
}
```

Category slugs remain the fixed platform-controlled set. There is deliberately no category-create or category-delete endpoint.

### Update a category

```http
PATCH /api/admin/categories/:id
```

At least one field is required:

```json
{
  "nameAr": "غرفة اجتماعات",
  "nameEn": "Business meeting room",
  "isActive": true,
  "sortOrder": 20
}
```

Changing a label or active state does not rewrite historical Space, quote, or booking snapshots. Inactive categories disappear from the public catalog and discovery.

### Create or update an amenity

```http
POST  /api/admin/amenities
PATCH /api/admin/amenities/:id
```

Create body:

```json
{
  "slug": "ev_charging",
  "nameAr": "شحن المركبات الكهربائية",
  "nameEn": "EV charging",
  "group": "parking",
  "isSearchable": true,
  "isActive": true
}
```

Slugs use lowercase letters, digits, and underscores and are immutable after creation. Duplicate slugs return `409 AMENITY_SLUG_CONFLICT`. Amenities are deactivated rather than deleted.

Every successful catalog mutation writes an `admin_audit_logs` entry in the same transaction.

## Audit-log inspection

```http
GET /api/admin/audit-logs
```

Required query:

```text
scope = admin | company | booking
```

Optional filters:

```text
action, targetType, targetId, companyId, actorUserId, page, limit
```

`companyId` is applicable to company and booking scopes. `targetType` is applicable to admin and company scopes. The response normalizes all three stores:

```json
{
  "data": [
    {
      "id": "19",
      "scope": "booking",
      "actorUserId": 4,
      "companyId": 2,
      "action": "booking.accept",
      "targetType": "booking",
      "targetId": 61,
      "previousStatus": "pending",
      "nextStatus": "accepted",
      "reason": null,
      "metadata": {},
      "createdAt": "..."
    }
  ],
  "metadata": {}
}
```

The endpoint is read-only. It never exposes authentication tokens, payment webhook bodies/signatures, provider secrets, or stored legal documents.

## Refund operation

```http
POST /api/admin/finance/refunds/:id/retry
```

```json
{ "idempotencyKey": "support-case-123-retry-1" }
```

This operation delegates to the same provider abstraction, advisory lock, idempotency rules, RefundAttempt history, and trusted webhook completion workflow used by company finance. It does not mark a Refund successful. A successful request means a provider attempt was created or reused; the Refund remains asynchronous.

Important errors include `REFUND_NOT_FOUND`, `REFUND_FINALIZED`, `REFUND_ATTEMPT_ACTIVE`, and `PAYMENT_IDEMPOTENCY_CONFLICT`. A successful retry writes `refund.retry` to the admin audit log.

## Payment disputes

Disputes are operational case records. They do not directly mutate Booking, Payment, Refund, inventory, or reconciliation state.

### Routes

```http
GET   /api/admin/disputes
POST  /api/admin/disputes
GET   /api/admin/disputes/:id
PATCH /api/admin/disputes/:id
```

List filters are `status`, `companyId`, `bookingId`, `page`, and `limit`.

Open a dispute:

```json
{
  "paymentId": 91,
  "refundId": 12,
  "reason": "Customer reported a duplicate provider collection"
}
```

`refundId` is optional but, when supplied, must belong to the selected Payment. Payment ownership supplies the trusted Booking, Company, and customer references; callers cannot provide those fields. Only one `open` or `under_review` dispute may exist per Payment, enforced in PostgreSQL.

### State machine

```text
open -> under_review | resolved | rejected
under_review -> resolved | rejected
resolved -> terminal
rejected -> terminal
```

Move into review:

```json
{ "status": "under_review" }
```

Resolve or reject:

```json
{
  "status": "resolved",
  "resolution": "Provider confirmed only one successful settlement."
}
```

Terminal states require a 10–4,000 character resolution. Non-terminal states reject a resolution. PostgreSQL also enforces that terminal rows have the resolving admin and timestamp, while non-terminal rows do not.

Every transition is row-locked and creates an admin audit event. Invalid transitions return `409 PAYMENT_DISPUTE_INVALID_TRANSITION`; duplicate active cases return `409 PAYMENT_DISPUTE_ACTIVE`.

## Mobile boundary

There is no customer- or company-facing dispute API. Support agents operate cases through the admin surface. Mobile clients continue reading Booking, Payment, Refund, receipt, and reconciliation-safe fields from their existing endpoints and must never infer those states from a dispute.
