# QaaAt Company App Integration Guide

This is the source-of-truth handoff for the company-facing mobile app. It covers multipart registration, approval states, hall management, booking decisions, and notifications as implemented on **2026-07-11**.

Development API references are available at `GET /docs` (Scalar) and `GET /openapi.json` (Outloud OpenAPI 3.1). The old `/api`, `/api.json`, and `/api.yaml` documentation endpoints no longer exist. Production documentation is disabled unless `OPENAPI_ENABLED=true`.

Read [README.md](./README.md) first for shared authentication, pagination, error normalization, rate limits, and backend setup.

## Sprint 1 membership and session contract

Company-app tokens persist `client:company_app` and `company:{id}` abilities. Customer-app tokens are rejected on company routes. A shared User may retain `userType: "user"` and still sign in here with an active membership.

`POST /api/companies/login` accepts `email`, `password`, and optional `companyId`. It preserves `user`, `company`, and `token`, and adds `membership` plus `memberships`. Each membership contains `id`, `companyId`, `role`, `status`, and resolved `permissions`.

- `GET /api/companies/members` requires `members.view`.
- `PATCH /api/companies/members/:id` accepts optional `role`, `status`, and `permissionOverrides`; it requires `members.manage`.
- `DELETE /api/companies/members/:id` revokes membership and only the company-app sessions scoped to that company. Customer sessions and sessions for other companies remain valid.
- `GET /api/companies/invitations` requires `members.view`.
- `POST /api/companies/invitations` accepts required `name`, required `email`, `role`, and optional overrides. Phone-only invitations are intentionally rejected until verified SMS delivery and phone-based authentication exist.
- `POST /api/companies/invitations/:id/resend` rotates the acceptance token.
- `DELETE /api/companies/invitations/:id` cancels a pending invitation.

Roles are `owner`, `manager`, `booking_staff`, `calendar_staff`, `accountant`, and `viewer`. Overrides use `{ permission, effect: "allow" | "deny" }`; deny wins. The final active owner cannot be removed or demoted. Only an owner can invite/promote/modify an owner or grant `payout_settings.manage`. Other members can delegate only effective permissions they already hold.

Public/auth-assisted acceptance uses `GET /api/company-invitations/inspect?token=...` and `POST /api/company-invitations/accept`. The acceptance secret is never returned by create, resend, or list APIs; it is delivered only to the invited mailbox through the notification outbox. For a genuinely new identity, the one-time hashed and expiring mailbox-delivered secret proves control of the invited email, and the employee supplies `password` plus optional `name`. The server creates the account using the locked invitation email, never a caller-supplied email. Existing users must authenticate normally, and acceptance never changes an existing password.

## Sprint 2 Venue and Space contract

Venue and Space APIs are additive. Existing Hall screens remain supported and are still the write source for mapped legacy records.

- `GET/POST /api/companies/venues`
- `GET/PATCH /api/companies/venues/:id`
- `GET/POST /api/companies/spaces`
- `GET/PATCH/DELETE /api/companies/spaces/:id`
- `POST /api/companies/spaces/:id/submissions`
- `GET /api/space-catalog`

Reads require `spaces.view`; writes require `spaces.manage` and an approved company. Every operation is scoped to the company selected by the company-app token.

New Venue and Space names use `{ ar?, en? }` and require at least one value. Responses derive `name` deterministically as Arabic, then English, then the preserved verbatim legacy name. New Space writes never accept a separate compatibility name.

Publication states are `draft`, `pending_review`, `changes_requested`, `published`, `suspended`, and `archived`. Providers edit `draft` or `changes_requested`, then resubmit. Editing a published non-legacy Space moves it directly to `pending_review` and hides it from public preview until an admin republishes it. Suspended and archived Spaces cannot be edited. Admins publish, request changes with a reason, suspend a published Space, or restore it. Providers cannot activate `instant_book`.

Mapped legacy Spaces are read-only through the Space mutation APIs. Continue updating those records through `/api/companies/halls`; the backend synchronizes only name, description, capacity, free-form `location` into `legacyLocation`, address/city, `isAvailable`, known amenities, and legacy images in one transaction. Legacy `location` is not assumed to be a structured district. It does not synchronize pricing, booking states, or arbitrary fields.

Media upload is not exposed in Sprint 2. Existing Hall image references appear as `legacy_imported` media. New media metadata requires a future controlled-storage upload workflow; arbitrary remote URLs are not accepted by Space APIs.

## Product flow

Sprint 3 calendar configuration uses weekly rules and date exceptions; a `closed` exception only changes offered schedule and is not an inventory record. External confirmed reservations, external holds, maintenance, operational closures, and internal events are separate auditable blocks. Calendar reads require `calendar.view`; writes require `calendar.manage`. External reservation deletion means cancellation/release, never hard deletion. Company calendar ranges are limited to 93 days and 100 rows per page.

1. Register with legal/business details and a scanned commercial-registration PDF.
2. Store the returned token and route by `data.company.status`; a new company starts as `pending`.
3. Pending or rejected companies can restore account state, read their halls, and read notifications, but cannot mutate halls or access booking management.
4. Approved companies can create and manage halls, receive booking requests, and accept or reject pending requests.
5. Admin suspension revokes existing access tokens and blocks future login.

## Endpoint map

| Method | Path                                                | Auth/state       | Purpose                            |
| ------ | --------------------------------------------------- | ---------------- | ---------------------------------- |
| POST   | `/api/companies/register`                           | Public multipart | Create pending company             |
| POST   | `/api/companies/login`                              | Public           | Sign in unless suspended           |
| GET    | `/api/companies/me`                                 | Company token    | Restore company and approval state |
| POST   | `/api/companies/logout`                             | Bearer           | Revoke current token               |
| GET    | `/api/companies/halls`                              | Company token    | List own halls                     |
| GET    | `/api/companies/halls/:id`                          | Company token    | Read own hall                      |
| POST   | `/api/companies/halls`                              | Approved company | Create hall                        |
| PUT    | `/api/companies/halls/:id`                          | Approved company | Update own hall                    |
| DELETE | `/api/companies/halls/:id`                          | Approved company | Soft-delete own hall               |
| GET    | `/api/companies/bookings`                           | Approved company | List bookings for own halls        |
| GET    | `/api/companies/bookings/pending`                   | Approved company | List actionable pending bookings   |
| GET    | `/api/companies/bookings/:id`                       | Approved company | Read owned booking                 |
| POST   | `/api/companies/bookings/:id/accept`                | Approved company | Accept pending booking             |
| POST   | `/api/companies/bookings/:id/reject`                | Approved company | Reject pending booking             |
| GET    | `/api/companies/notifications`                      | Company token    | List notifications                 |
| GET    | `/api/companies/notifications/unread-count`         | Company token    | Get unread count                   |
| POST   | `/api/companies/notifications/:id/read`             | Company token    | Mark one read                      |
| POST   | `/api/companies/notifications/read-all`             | Company token    | Mark all read                      |
| POST   | `/api/companies/push-installations`                 | Company token    | Register or refresh this device    |
| DELETE | `/api/companies/push-installations/:installationId` | Company token    | Revoke this device installation    |

Hall reads intentionally do not require approval; hall writes do. All booking-management actions require approval. Notifications require a company account but not approval.

## Approval and session states

```ts
type CompanyStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
```

| Status      | Login                     | `/me`, hall reads, notifications                | Hall writes and bookings                          |
| ----------- | ------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `pending`   | Allowed                   | Allowed                                         | `403 COMPANY_PENDING_APPROVAL`                    |
| `approved`  | Allowed                   | Allowed                                         | Allowed                                           |
| `rejected`  | Allowed                   | Allowed                                         | `403 COMPANY_REJECTED` with a flat `reason` field |
| `suspended` | `401 INVALID_CREDENTIALS` | Existing tokens are revoked when admin suspends | Blocked                                           |

Always use `company.status`, not the login message, as the state source of truth. Refresh `/api/companies/me` when the app resumes and after the user receives an approval/rejection notification.

Approval middleware errors use the flat shape, for example:

```json
{
  "message": "Your company is pending admin approval. You cannot perform this action yet.",
  "code": "COMPANY_PENDING_APPROVAL"
}
```

## Data types

Company auth endpoints serialize the Lucid company model directly, while hall and booking endpoints use narrower transformers. Do not use one global `Company` type for both shapes.

```ts
type CompanyAuthRecord = {
  id: number
  taxId: string | null
  registrationNumber: string | null
  registrationNumberPdf: string | null
  businessLicense: string | null
  contactPerson: string | null
  businessAddress: string | null
  city: string
  userId: number
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
  status: CompanyStatus
  approvedAt: string | null
  approvedBy: number | null
  rejectionReason: string | null
  rejectedAt: string | null
  companyProfile: {
    id: number
    userId: number
    companyName: string
    description: string | null
    logo: string | null
    banner: string | null
    website: string | null
    socialLinks: Record<string, unknown> | string | null
    createdAt: string
    updatedAt: string | null
    deletedAt: string | null
  } | null
}

type Hall = {
  id: number
  name: string
  description: string | null
  capacity: number
  location: string
  amenities: Record<string, unknown> | null
  images: string[] | null
  address: string
  city: string
  services: string[] | null
  isAvailable: boolean
  createdAt: string
  updatedAt: string | null
  pricing: number
  company?: unknown
}

type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'completed'

type Booking = {
  id: number
  bookingDate: string
  startTime: string
  endTime: string
  status: BookingStatus
  specialRequests: string | null
  rejectionReason: string | null
  companyRespondedAt: string | null
  expiresAt: string | null
  paymentStatus: 'unpaid' | 'paid' | 'refunded'
  paymentDueDate: string | null
  createdAt: string
  updatedAt: string | null
  totalPrice: number | null
  totalPriceDecimal: string | null
  totalPriceMinor: string | null
  isExpired: boolean
  hall?: Hall
  user?: {
    id: number
    userName: string | null
    email: string
    userType: string
    createdAt: string
    updatedAt: string | null
    isEmailVerified: boolean
    userProfile?: {
      id: number
      firstName: string | null
      lastName: string | null
      phone: string | null
      address: string | null
      avatar: string | null
    }
  }
  services?: Array<{
    id: number
    name: string
    description: string | null
    isActive: boolean
    createdAt: string
    updatedAt: string | null
    price: number
  }>
}

Booking money compatibility: `totalPriceDecimal` is always the exact major-unit string when a total exists. Quote-backed Bookings also return the immutable `totalPriceMinor`. Numeric `totalPrice` is retained for ordinary safe legacy values and becomes `null` rather than rounded for larger amounts.

type Notification = {
  id: number
  type: string
  title: string
  message: string
  data: Record<string, unknown> | null
  readAt: string | null
  createdAt: string
  isRead: boolean
}
```

Relations are conditional. In particular, company-owned hall endpoints do not preload `company`, so it is normally omitted. Booking list and mutation endpoints preload different depths of `user`, `hall`, and `services`.

## Authentication

### Register company

`POST /api/companies/register` must be `multipart/form-data`.

Required fields:

- `email`: unique valid email
- `password`: at least eight characters
- `companyName`
- `registrationNumber`
- `registrationNumberPdf`: PDF, maximum 10 MB
- `businessAddress`
- `city`

Optional string fields: `taxId`, `businessLicense`, `contactPerson`, `description`, `logo`, `banner`, and `website`. `socialLinks` is accepted as an untyped optional value.

Expo/React Native example:

```ts
const body = new FormData()
body.append('email', 'company@example.com')
body.append('password', 'password123')
body.append('companyName', 'Royal Events Co.')
body.append('registrationNumber', 'CR-1234567890')
body.append('businessAddress', '123 King Fahd Road')
body.append('city', 'Riyadh')
body.append('registrationNumberPdf', {
  uri: selectedPdf.uri,
  name: selectedPdf.name ?? 'registration.pdf',
  type: 'application/pdf',
} as any)

await fetch(`${API_URL}/api/companies/register`, {
  method: 'POST',
  headers: { Accept: 'application/json' },
  body,
})
```

Do not manually set the multipart `Content-Type` header.

The backend verifies the declared MIME type, `%PDF-` signature, `%%EOF` marker, actual size, and malware scan before storing the file privately. Relevant failures include `PDF_SIZE_INVALID`, `PDF_MIME_INVALID`, `PDF_SIGNATURE_INVALID`, `PDF_STRUCTURE_INVALID`, `PDF_MALWARE_DETECTED`, and `PDF_MALWARE_SCAN_UNAVAILABLE` (`503`). A scanner outage fails registration closed.

`registrationNumberPdf` is stored on the private disk and is not exposed through a download route.

Current `socialLinks` caveat: multipart text fields arrive as strings, and the backend does not parse a JSON string before saving it. Omit this field unless string-valued behavior is acceptable, or add backend parsing before relying on an object shape. `logo` and `banner` are string fields, not file uploads.

Success `201`:

```json
{
  "message": "Company registered successfully. Your account is pending admin approval.",
  "data": {
    "user": { "id": 2, "email": "company@example.com", "userType": "company" },
    "company": {
      "id": 1,
      "companyName": "Royal Events Co.",
      "city": "Riyadh",
      "status": "pending"
    },
    "token": { "type": "bearer", "token": "..." }
  }
}
```

The registration company object is intentionally compact and differs from login and `/me`.

### Login

`POST /api/companies/login`

```json
{ "email": "company@example.com", "password": "password123" }
```

Success `200` returns `{ message, data: { user, company, token } }`, where `company` is the expanded `CompanyAuthRecord`. Pending and rejected companies can log in; suspended, deleted, wrong-type, and bad-credential accounts receive `401 INVALID_CREDENTIALS`.

Possible successful messages are `Login successful`, the pending variant, and the rejected variant. There is no successful suspended variant in the current controller.

### Restore session

`GET /api/companies/me` returns:

```json
{
  "data": {
    "user": { "id": 2, "email": "company@example.com", "userType": "company" },
    "company": {}
  }
}
```

The actual `company` is the expanded auth record including `companyProfile`. Use this endpoint to restore status and profile after reading the stored token.

### Logout

`POST /api/companies/logout` revokes only the current token and returns `{ "message": "Logged out successfully" }`.

## Hall management

`pricing` is the hourly hall rate. Hall `services` is a free-form string array for descriptive labels; it is separate from the priced service records used by bookings.

### List halls

`GET /api/companies/halls?page=1&limit=20`

Returns `{ data: Hall[], meta }`, newest first, and excludes soft-deleted halls. This endpoint is available to pending and rejected companies. Returned halls normally omit `company`.

### Hall details

`GET /api/companies/halls/:id` returns `{ data: Hall }` only for a hall owned by the authenticated company. The service preloads bookings internally, but the hall transformer does not expose them. Use the booking endpoints instead.

### Create hall

`POST /api/companies/halls`

```json
{
  "name": "Royal Grand Hall",
  "description": "Large luxury event hall",
  "capacity": 500,
  "location": "Al Olaya District",
  "amenities": { "parking": true, "wifi": true },
  "pricing": 5000,
  "images": ["https://cdn.example.com/hall.jpg"],
  "address": "123 King Fahd Road",
  "city": "Riyadh",
  "services": ["coffee", "parking"],
  "isAvailable": true
}
```

Required: `name`, `capacity >= 1`, `location`, `pricing >= 0`, `address`, and `city`. Optional: `description`, arbitrary `amenities`, `images` string array, `services` string array, and `isAvailable` (defaults to true).

Success `201` is `{ message: "Hall created successfully", data: Hall }`.

### Update hall

`PUT /api/companies/halls/:id` accepts the same fields, all optional, and returns `{ message, data: Hall }`. Sending an empty object is currently valid and performs a no-op save.

### Delete hall

`DELETE /api/companies/halls/:id` soft-deletes the owned hall and returns `{ "message": "Hall deleted successfully" }`. There is no restore endpoint.

Create/update/delete require `approved` status. The API accepts image URLs/strings but provides no image upload route.

## Booking management

All endpoints in this section require an approved company and only expose bookings whose halls belong to that company.

### List all bookings

`GET /api/companies/bookings?page=1&limit=20&status=pending`

Returns `{ data: Booking[], meta }`, newest first. Each row preloads `hall`, `user`, and `services`; the user profile is not preloaded in this list, so `user.userProfile` is normally omitted. The optional `status` filter is passed directly to the database; send a documented booking status.

### List actionable pending bookings

`GET /api/companies/bookings/pending?page=1&limit=20`

Returns only `pending` bookings whose `expiresAt` is still in the future. Results are oldest first so the most urgent request appears first. Relations have the same depth as the all-bookings list.

### Booking details

`GET /api/companies/bookings/:id` returns `{ data: Booking }`. It includes `hall`, `services`, and `user.userProfile`. Unknown IDs and bookings owned by another company both return `404 BOOKING_NOT_FOUND`.

### Accept booking

`POST /api/companies/bookings/:id/accept`

Only `pending → accepted` is allowed. Acceptance sets `companyRespondedAt`, sets a payment deadline three days later, and atomically records both the audit event and notification intent. A background outbox worker then creates the in-app notification and queues its email. The booking response does not wait for notification delivery.

Success `200`:

```json
{
  "message": "Booking accepted successfully. The customer will be notified to proceed with payment.",
  "data": { "id": 10, "status": "accepted", "paymentStatus": "unpaid" }
}
```

The real `data` includes the transformer fields and the relations loaded by this action, but does not preload `services` or the user's profile. Treat both as optional and refresh the detail endpoint if needed.

### Reject booking

`POST /api/companies/bookings/:id/reject`

```json
{ "reason": "The hall is unavailable on this date" }
```

The reason is required and must be 10–500 characters. Only `pending → rejected` is allowed. Rejection sets `companyRespondedAt` and `rejectionReason`, and atomically records the audit event and notification intent. Delivery is asynchronous through the retrying outbox worker.

Success is `{ message: "Booking rejected. The customer will be notified.", data: Booking }`. As with accept, services and the user profile may be omitted.

Decision failures include:

| Status | Code                         | Meaning                            |
| -----: | ---------------------------- | ---------------------------------- |
|    404 | `BOOKING_NOT_FOUND`          | ID is absent/not owned             |
|    403 | `FORBIDDEN_ACTION`           | Defense-in-depth ownership failure |
|    409 | `BOOKING_EXPIRED`            | Seven-day response window elapsed  |
|    409 | `BOOKING_INVALID_TRANSITION` | Booking is no longer pending       |

Pending bookings are converted to `expired` by an hourly scheduled job. There are no company endpoints to confirm payment or mark a booking completed.

## Notifications

### List

`GET /api/companies/notifications?page=1&limit=20&unread_only=true`

Returns `{ data: Notification[], meta }`, newest first. Company flows currently generate `new_booking_request`, `company_approved`, and `company_rejected`; render unknown types generically.

Notifications are eventually consistent. Booking and company-status transactions persist their notification intent atomically, while a worker processes the outbox every minute with retry delays and idempotent in-app delivery. Poll the unread count and refresh on app resume; do not require a notification to appear immediately after a successful mutation response.

### Count and read state

- `GET /api/companies/notifications/unread-count` → `{ "data": { "unreadCount": 2 } }`
- `POST /api/companies/notifications/:id/read` → `{ message, data: Notification }`
- `POST /api/companies/notifications/read-all` → `{ message, data: { markedCount: number } }`

Notification ownership is enforced; unknown or another account's ID returns `404 NOTIFICATION_NOT_FOUND`.

### Expo push installation

After login and whenever Expo returns a refreshed token, register the installation:

```http
POST /api/companies/push-installations
Authorization: Bearer <company-token>
Content-Type: application/json

{
  "installationId": "93e33577-61c0-4efa-a760-df20d80f6b49",
  "expoPushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "ios",
  "deviceName": "iPhone",
  "appVersion": "1.0.0"
}
```

The idempotent `200` response contains `installationId`, platform, optional device metadata,
`notificationsEnabled`, and `lastSeenAt`. It never returns the Expo token. Pending and rejected
companies may register so they can receive account-status updates; suspended or deleted companies
receive `403`.

Before local logout or notification opt-out, call
`DELETE /api/companies/push-installations/:installationId`. It always returns `204` for the current
account, including when the installation is already absent or revoked. Local logout must still
complete if this best-effort request fails. Logging out one installation must not revoke other
devices.

Push payload data contains only `notificationId`, `type`, `route`, and an optional `bookingId`.
Treat the route as a navigation hint, then authenticate and fetch the authoritative resource. The
backend sends generic text for account rejection and never includes rejection reasons or customer
details in a push. In-app notification records remain authoritative when pushes are delayed,
duplicated, or unavailable.

## Recommended client behavior

- Model registration, auth company, and transformer company payloads as different types.
- Route by `company.status` and refresh `/me`; do not parse status from message text.
- Preserve read-only hall access on pending/rejected screens, but hide hall mutations and all booking management until approval.
- Treat nested booking relations as optional and refresh details after accept/reject when a complete object is required.
- Do not expose company-profile editing, service CRUD, registration-PDF download, payment actions, or media upload until backend endpoints are added.

# Sprint 4 request workflows

- Use `GET /api/companies/booking-requests` as the unified provider inbox for both legacy Hall and new Space-only request-to-book records. `pending` means awaiting provider; `accepted` means approved and awaiting payment. Approval can return `409 INVENTORY_OVERLAP`, `AVAILABILITY_SCHEDULE_CONFLICT`, or `SPACE_NOT_APPROVABLE`; refresh the item and calendar instead of retrying blindly.
- Date inquiries use `/api/companies/date-inquiries`. They never reserve inventory. Members need `inquiries.view` to read and `inquiries.manage` to answer.
- Visit requests use `/api/companies/visit-requests`. They never create rentable-space blocks. Confirmation can return `409 VISIT_TIME_CONFLICT` when the Venue already has a confirmed visit.
- Confirming the customer's exact visit interval sets `confirmed`. Supplying a different interval creates `alternative_proposed`; it is not confirmed until the customer explicitly accepts it. Refresh after `REQUEST_VERSION_CONFLICT`.
- Confirmation and proposed alternatives must start in the future and end after they start. Invalid or elapsed intervals return `422 REQUEST_TIME_INVALID`.
- Company request notifications fan out only to active members with the effective view permission after role presets and allow/deny overrides. Direct customer email snapshots are redacted from every inquiry and visit list, detail, and mutation response.
- Configure response deadlines with `GET|PUT /api/companies/spaces/:spaceId/request-settings`. Null overrides inherit category defaults.
- Present Arabic labels first with deterministic English fallback. Suggested labels: `pending` = `بانتظار رد المزود`, `accepted` = `مقبول - بانتظار الدفع`, inquiry `open` = `مفتوح`, visit `submitted` = `بانتظار التأكيد`.
- Existing `/api/companies/bookings` and `/api/companies/bookings/pending` remain operational for legacy Hall screens during migration.

# Sprint 5 pricing and quotes

Company pricing uses integer SAR minor units represented as decimal strings in request and response JSON. Never parse monetary fields through JavaScript `Number`; use string/BigInt-safe client handling. Manage rate plans under `/api/companies/pricing/rate-plans`, priced options under `/pricing/service-options`, Space attachments under `/spaces/:spaceId/service-options`, and packages under `/pricing/packages`. Reads require `pricing.view`; mutations require `pricing.manage`.

Create quotes from eligible date inquiries with `POST /api/companies/quotes`. Quote mutations require `quotes.manage`; inbox/history reads require `quotes.view`. Sending freezes a revision. Editing commercial content after send creates a new draft revision that must be sent explicitly. Statuses are `draft`, `sent`, `accepted`, `customer_declined`, `expired`, and `withdrawn`. Quote acceptance creates an awaiting-payment inventory hold, not payment or confirmation.

Legacy Hall service strings remain descriptive compatibility data and are not priced service options.

Every quote revision uses one VAT-inclusion display policy across all lines. Mixed source policies return `422 QUOTE_TAX_POLICY_MIXED`.

## Sprint 6 company finance

Members with effective `finance.view` may read `/api/companies/payments`, `/api/companies/refunds`, and `/api/companies/reconciliation`. `refunds.approve` manages cancellation-policy versions; `refunds.request` may call `/api/companies/bookings/:bookingId/paid-cancellation`. Active membership, tenant scope, role presets, and allow/deny overrides apply.

Retry a failed Refund with `POST /api/companies/refunds/:id/retry` and `{ idempotencyKey }`. This requires effective `refunds.approve`; revoked memberships and deny overrides are rejected. Each retry adds a historical RefundAttempt to the same Refund. Same-key reuse returns the same attempt, conflicting reuse returns `PAYMENT_IDEMPOTENCY_CONFLICT`, and succeeded Refunds cannot be retried.

Amounts are canonical minor-unit strings. `deposit` is distinct from `full_payment`, and remaining balance must stay visible. Do not build manual mark-paid/refunded controls: verified provider events own financial completion and Booking confirmation. Reconciliation is read-only evidence.

Provider cancellation is explicitly full-refundable in this MVP. Customer refunds use the policy snapshot captured before payment. Historical Bookings do not change after policy edits. Receipt snapshots are not ZATCA tax invoices.

Finance notifications fan out only to active members with effective `finance.view`, including deny overrides. Payment/refund failure and reconciliation events are durable operational notifications. Never expose raw webhook bodies, signatures, provider secrets, customer contact snapshots, or mutable receipt controls.
