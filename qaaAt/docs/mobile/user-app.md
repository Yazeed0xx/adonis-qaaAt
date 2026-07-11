# QaaAt User App Integration Guide

This is the source-of-truth handoff for the customer-facing mobile app. It covers registration, OTP verification, public hall discovery, availability, bookings, and notifications as implemented on **2026-07-11**.

Development API references are available at `GET /docs` (Scalar) and `GET /openapi.json` (Outloud OpenAPI 3.1). The old `/api`, `/api.json`, and `/api.yaml` documentation endpoints no longer exist. Production documentation is disabled unless `OPENAPI_ENABLED=true`.

Read [README.md](./README.md) first for shared authentication, pagination, error normalization, rate limits, and backend setup.

## Session isolation

Customer registration and login issue tokens with persisted `client:customer_app` context. Company-app and admin-app tokens are rejected from customer routes. A customer invited into a company keeps the same identity, password, and personal bookings, then signs into the company app separately for a company-scoped token.

## Public Space discovery

Use `GET /api/spaces` for incremental customer migration from Hall discovery. It returns published wedding halls and all other controlled Space categories, including Space-only records, without duplicating mapped Halls. `GET /api/halls` remains unchanged.

The endpoint accepts `q`, `category`, `city`, minimum `capacity`, comma-separated controlled `amenities` (AND semantics), `bookingMode`, `pricingMode`, `minimumPriceMinor`, `maximumPriceMinor`, explicit-offset `from`/`to`, `sessionCode`, `sort`, `page`, and `limit` (maximum 50). Capacity, page, and limit are integers. Price filters are canonical non-negative integer strings up to `9223372036854775807`; never convert them through JavaScript `Number`. Results use Arabic, then English, then preserved legacy text. Relevance ranks exact name, name prefix, name substring, then description, and requires `q`. When `from`/`to` are supplied, only Spaces with a valid authoritative availability candidate are returned; pagination remains page-based and may return `SPACE_DISCOVERY_WORK_LIMIT` when the 10 × 200 candidate scan ceiling cannot establish a truthful page. See `docs/product/SPACE_DISCOVERY_IMPLEMENTATION_NOTES_EN.md` for the full contract and stable errors.

## Sprint 2 Space preview

The current Hall discovery, Hall detail, availability, and booking APIs remain unchanged. Continue using them for production booking flows.

Sprint 2 adds `GET /api/space-catalog` and safe read-by-ID preview at `GET /api/spaces/:id`. Broad Space discovery is deferred until Sprint 3 availability rules exist. The preview returns only a published Space from an approved company. A mapped legacy Hall is additionally hidden when its preserved `isAvailable` value is false.

Localized `name` and `description` prefer Arabic, fall back to English, and finally use the verbatim legacy Hall value. `legacy_imported` media may contain historical Hall references; new arbitrary external media URLs are not accepted.

Mapped legacy Venue previews preserve the Hall's free-form `location` as `legacyLocation`; clients must not interpret it as a normalized district.

Do not create bookings from the new Space preview yet. `bookings.hall_id`, legacy pricing, and existing Hall availability remain authoritative during this compatibility phase.

## Product flow

Sprint 3 keeps `GET /api/halls/:id/availability` and its response envelope, but availability now comes from the mapped Space schedule and inventory ledger. Pending/unapproved requests no longer block slots; confirmed bookings, active holds, and operational blocks do. New public Space availability accepts explicit-offset `from`/`to` instants and is limited to 31 days.

1. Register and store `data.token.token` securely.
2. Ask for the six-digit email OTP and verify it. Browsing works before verification, but booking creation does not.
3. Browse approved companies' available halls and inspect a hall's two-hour availability slots.
4. Submit a booking request. The company has seven days to accept or reject it.
5. Show booking status and notifications. An accepted booking receives a three-day payment deadline, but payment itself is not implemented by this API.

## Endpoint map

| Method | Path                                            | Auth                | Purpose                          |
| ------ | ----------------------------------------------- | ------------------- | -------------------------------- |
| POST   | `/api/users/register`                           | Public              | Create customer account          |
| POST   | `/api/users/login`                              | Public              | Sign in                          |
| GET    | `/api/users/me`                                 | Bearer              | Restore account/profile          |
| POST   | `/api/users/logout`                             | Bearer              | Revoke current token             |
| POST   | `/api/users/verify-email`                       | Public              | Verify six-digit OTP             |
| POST   | `/api/users/resend-verification`                | Public              | Request another OTP              |
| GET    | `/api/halls`                                    | Public              | Search available halls           |
| GET    | `/api/halls/cities`                             | Public              | List cities with available halls |
| GET    | `/api/halls/:id`                                | Public              | Read hall details                |
| GET    | `/api/halls/:id/availability`                   | Public              | Read availability for a date     |
| GET    | `/api/users/bookings`                           | User token          | List own bookings                |
| POST   | `/api/users/bookings`                           | Verified user token | Create booking request           |
| GET    | `/api/users/bookings/:id`                       | User token          | Read own booking                 |
| POST   | `/api/users/bookings/:id/cancel`                | User token          | Cancel own eligible booking      |
| GET    | `/api/users/notifications`                      | User token          | List notifications               |
| GET    | `/api/users/notifications/unread-count`         | User token          | Get unread count                 |
| POST   | `/api/users/notifications/:id/read`             | User token          | Mark one read                    |
| POST   | `/api/users/notifications/read-all`             | User token          | Mark all read                    |
| POST   | `/api/users/push-installations`                 | Verified user token | Register or refresh this device  |
| DELETE | `/api/users/push-installations/:installationId` | User token          | Revoke this device installation  |

## Data types

```ts
type AuthUser = {
  id: number
  userName: string | null
  email: string
  userType: 'user'
  emailVerified: boolean
}

type UserProfile = {
  id: number
  firstName: string | null
  lastName: string | null
  phone: string | null
  address: string | null
  avatar: string | null
}

type AuthUserProfile = UserProfile & {
  userId: number
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
}

type CompanySummary = {
  id: number
  city: string
  status: string
  createdAt: string
  updatedAt: string | null
  companyProfile?: {
    id: number
    companyName: string
    description: string | null
    logo: string | null
    banner: string | null
    website: string | null
    socialLinks: Record<string, unknown> | null
  }
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
  company?: CompanySummary
}

type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'completed'

type PaymentStatus = 'unpaid' | 'paid' | 'refunded'

type Service = {
  id: number
  name: string
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string | null
  price: number
}

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
  paymentStatus: PaymentStatus
  paymentDueDate: string | null
  createdAt: string
  updatedAt: string | null
  totalPrice: number | null
  totalPriceDecimal: string | null
  totalPriceMinor: string | null
  isExpired: boolean
  hall?: Hall
  services?: Service[]
}

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

`Hall.services` is a string array stored on the hall and is not the same thing as the priced `Service[]` attached to a booking.

`totalPriceDecimal` is the exact canonical major-unit amount. `totalPriceMinor` is the immutable accepted Quote total when present. The legacy numeric `totalPrice` remains available only when minor units are within JavaScript's safe-integer compatibility range; otherwise it is `null` and clients must use the exact string fields.

## Authentication and verification

### Register

`POST /api/users/register`

```json
{
  "userName": "Mohammed Ahmed",
  "email": "mohammed@example.com",
  "password": "password123",
  "firstName": "Mohammed",
  "lastName": "Ahmed",
  "phone": "+966501234567",
  "address": "Riyadh"
}
```

`userName`, a unique valid `email`, and a password of at least eight characters are required. `userName` is trimmed and must contain at least two characters. The profile fields are optional; when all are omitted, no profile row is created.

Success `201`:

```json
{
  "message": "User registered successfully. Please check your email for your verification code.",
  "data": {
    "user": {
      "id": 1,
      "userName": "Mohammed Ahmed",
      "email": "mohammed@example.com",
      "userType": "user",
      "emailVerified": false
    },
    "token": { "type": "bearer", "token": "..." }
  }
}
```

Registration succeeds even if mail delivery fails. Keep a resend action available.

### Verify email

`POST /api/users/verify-email`

```json
{ "email": "mohammed@example.com", "code": "123456" }
```

The code is exactly six digits and expires after 10 minutes. Success `200` returns:

```json
{
  "message": "Email verified successfully",
  "data": {
    "user": { "id": 1, "email": "mohammed@example.com", "emailVerified": true }
  }
}
```

Relevant error codes are `INVALID_VERIFICATION_CODE`, `EXPIRED_VERIFICATION_CODE`, and `EMAIL_ALREADY_VERIFIED`.

### Resend verification

`POST /api/users/resend-verification`

```json
{ "email": "mohammed@example.com" }
```

The endpoint always returns the same `200` message for unknown, already verified, cooldown, and successfully resent cases to prevent account discovery. The internal resend cooldown is five minutes, in addition to the route rate limit.

### Login

`POST /api/users/login`

```json
{ "email": "mohammed@example.com", "password": "password123" }
```

Success `200` has the same `{ message, data: { user, token } }` structure as registration. An unverified customer may log in; use `data.user.emailVerified` to decide whether to show the OTP gate.

Bad credentials, deleted users, and non-user account types return `401 INVALID_CREDENTIALS` in the standard error envelope.

### Restore session

`GET /api/users/me`

```json
{
  "data": {
    "user": {
      "id": 1,
      "userName": "Mohammed Ahmed",
      "email": "mohammed@example.com",
      "userType": "user",
      "emailVerified": true,
      "profile": {
        "id": 1,
        "firstName": "Mohammed",
        "lastName": "Ahmed",
        "phone": "+966501234567",
        "address": "Riyadh",
        "avatar": null
      }
    }
  }
}
```

`profile` can be `null`. Because `/me` embeds the raw profile model, it also currently includes `userId`, `createdAt`, `updatedAt`, and `deletedAt`; model it as `AuthUserProfile`. Notice that auth endpoints use `emailVerified` and `profile`, while nested booking users elsewhere use the narrower transformer names `isEmailVerified` and `userProfile`.

### Logout

`POST /api/users/logout` revokes only the current token and returns `{ "message": "Logged out successfully" }`.

## Hall discovery

Only halls that are not deleted, are marked available, and belong to an approved, non-deleted company with a non-deleted owner appear publicly. Banned, deleted, suspended, pending, and rejected companies cannot expose bookable halls. A hall can disappear between discovery and booking; treat `404 HALL_NOT_FOUND` as a stale listing and refresh discovery.

### Browse halls

`GET /api/halls`

| Query          | Type   | Behavior                                               |
| -------------- | ------ | ------------------------------------------------------ |
| `page`         | number | Defaults to 1                                          |
| `limit`        | number | Defaults to 20; maximum 100                            |
| `city`         | string | Exact city match                                       |
| `min_capacity` | number | Capacity greater than or equal                         |
| `max_price`    | number | Hourly hall price less than or equal                   |
| `search`       | string | Case-insensitive name, description, or location search |

Success is `{ data: Hall[], meta: PaginationMeta }`. Public hall results preload `company.companyProfile`.

### Hall details

`GET /api/halls/:id` returns `{ data: Hall }`. A hidden/deleted hall or a hall from a non-approved company returns `404 HALL_NOT_FOUND`.

### Cities

`GET /api/halls/cities`

```json
{ "data": { "cities": ["Jeddah", "Riyadh"] } }
```

The list is distinct and alphabetically ordered.

### Availability

`GET /api/halls/:id/availability?date=2026-07-20`

```json
{
  "data": {
    "hallId": 1,
    "hallName": "Royal Grand Hall",
    "date": "2026-07-20",
    "slots": [
      { "startTime": "08:00", "endTime": "10:00", "isAvailable": true },
      { "startTime": "10:00", "endTime": "12:00", "isAvailable": false },
      { "startTime": "12:00", "endTime": "14:00", "isAvailable": true },
      { "startTime": "14:00", "endTime": "16:00", "isAvailable": true },
      { "startTime": "16:00", "endTime": "18:00", "isAvailable": true },
      { "startTime": "18:00", "endTime": "20:00", "isAvailable": true },
      { "startTime": "20:00", "endTime": "22:00", "isAvailable": true }
    ]
  }
}
```

The date is required, must be a real `YYYY-MM-DD` calendar date, and cannot be in the past. The displayed availability grid is fixed to two-hour slots from 08:00 through 22:00. Booking creation accepts arbitrary valid 24-hour `HH:mm` ranges and checks overlap against pending, accepted, and confirmed bookings, so the grid is guidance rather than the only legal set of times.

## Bookings

### Create booking

`POST /api/users/bookings`

```json
{
  "hallId": 1,
  "bookingDate": "2026-07-20",
  "startTime": "18:00",
  "endTime": "22:00",
  "serviceIds": [1, 2],
  "specialRequests": "Please add extra chairs"
}
```

Rules:

- `hallId` must be a positive number.
- `bookingDate` must be a real calendar date in exact `YYYY-MM-DD` form and cannot be in the past. Values such as `2026-02-30` return `422 VALIDATION_ERROR`.
- Times must be valid 24-hour values from `00:00` through `23:59` in exact `HH:mm` form, and `endTime` must compare later than `startTime`. Values such as `25:00` or `10:75` return `422 VALIDATION_ERROR`.
- `specialRequests` is optional and limited to 1,000 characters.
- Duplicate service IDs are deduplicated.
- Every selected service must be active, not deleted, and owned by the hall's company.
- The hall must still be public/available and the requested time must not overlap an active booking.

Price calculation is `hall.pricing × durationInHours + each selected service price once`.

Success `201` returns `{ message, data: Booking }`, with `hall` (including company/profile) and `services`; `user` is omitted. New bookings have `status: "pending"`, `paymentStatus: "unpaid"`, and an `expiresAt` seven days after creation. The booking and company-notification intent commit atomically, but notification delivery is asynchronous and does not delay this response.

Important: the current API has no endpoint from which the user app can discover valid priced service IDs. Do not derive `serviceIds` from `Hall.services`, because that field contains names/labels, not service records. Until a service-catalog endpoint is added, omit `serviceIds` or obtain them through a separately agreed source.

Common domain errors:

| Status | Code                          | Meaning                                       |
| -----: | ----------------------------- | --------------------------------------------- |
|    403 | `EMAIL_NOT_VERIFIED`          | Flat middleware error; show OTP gate          |
|    404 | `HALL_NOT_FOUND`              | Hall is absent or no longer publicly bookable |
|    409 | `HALL_UNAVAILABLE`            | Hall exists but is disabled                   |
|    409 | `BOOKING_SLOT_UNAVAILABLE`    | Requested range overlaps an active booking    |
|    409 | `BOOKING_SERVICE_UNAVAILABLE` | A selected service is invalid/inactive        |
|    422 | `BOOKING_DATE_INVALID`        | Date is in the past                           |
|    422 | `BOOKING_TIME_INVALID`        | End time is not after start time              |

### List bookings

`GET /api/users/bookings?page=1&limit=20&status=pending`

Returns `{ data: Booking[], meta }`, newest first. `status` is passed directly to the database; send one of the documented booking status values. List rows include `hall.company.companyProfile` and `services`, but omit `user`.

### Booking details

`GET /api/users/bookings/:id` returns `{ data: Booking }` only when the booking belongs to the authenticated customer. It includes hall/company/profile and services. Unknown or someone else's ID returns `404 BOOKING_NOT_FOUND`.

### Cancel booking

`POST /api/users/bookings/:id/cancel`

The implemented state machine permits `pending → cancelled` and `accepted → cancelled`. Other statuses return `409 BOOKING_INVALID_TRANSITION`. The response is `{ message, data: Booking }`; this mutation only preloads `hall`, so `services` and nested hall company details may be omitted. Refresh the detail endpoint if the screen needs the fully expanded record.

There is currently no API action for the user to confirm, pay, refund, or complete a booking.

## Notifications

All notification IDs are scoped to the authenticated account.

### List

`GET /api/users/notifications?page=1&limit=20&unread_only=true`

Returns `{ data: Notification[], meta }`, newest first. `unread_only` is true only when sent as boolean `true` or string `"true"`.

User-facing types currently generated by booking flows include `booking_accepted`, `booking_rejected`, and `booking_expired`. The model also allows other string types, so render unknown types with a generic notification layout.

Notifications are eventually consistent. Booking transactions write notification intents to a transactional outbox, and a worker processes them every minute with retry delays and idempotent in-app creation. Poll the unread count, refresh on app resume, and do not assume a notification will be visible immediately after another booking action completes.

### Count and read state

- `GET /api/users/notifications/unread-count` → `{ "data": { "unreadCount": 2 } }`
- `POST /api/users/notifications/:id/read` → `{ message, data: Notification }`
- `POST /api/users/notifications/read-all` → `{ message, data: { markedCount: number } }`

An unknown or another user's notification returns `404 NOTIFICATION_NOT_FOUND`.

### Expo push installation

After verified login and whenever Expo returns a refreshed token, register the installation:

```http
POST /api/users/push-installations
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "installationId": "93e33577-61c0-4efa-a760-df20d80f6b49",
  "expoPushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "android",
  "deviceName": "Pixel",
  "appVersion": "1.0.0"
}
```

The idempotent `200` response contains safe installation metadata but never returns the Expo token.
Registration requires a verified, non-deleted user account. Before local logout or notification
opt-out, call `DELETE /api/users/push-installations/:installationId`; it returns `204` even when the
current account does not own an active matching installation. Local logout must still complete when
this best-effort request fails.

User booking pushes use the `booking_updates` Android channel. Payload data contains only
`notificationId`, `type`, `route`, and `bookingId`. Supported booking types are
`booking_accepted`, `booking_rejected`, and `booking_expired`; unknown future types use a generic
notification. Never trust payload status or text as authoritative—open the route and fetch the
authenticated booking endpoint. Rejection reasons and private booking details are intentionally
excluded from push payloads.

## Recommended client behavior

- Persist only the raw token, not the whole auth response; restore fresh account state with `/me`.
- Keep OTP verification separate from authentication. A valid token does not imply a verified email.
- Treat nested transformer relations as optional.
- Disable duplicate booking submissions while the first request is in flight; the backend also serializes same-hall/day creation and rejects overlaps.
- Do not present payment, profile editing, password reset, or priced service selection until their backend endpoints exist.

# Sprint 4 request workflows

- For a published Space with `bookingMode=request_to_book`, submit to `POST /api/users/booking-requests`. Persist and reuse `idempotencyKey` for retries. Pending requests may overlap and do not reserve inventory.
- For date-first or `quote_required` experiences, submit `POST /api/users/date-inquiries`. Sprint 4 does not expose quotes, prices, VAT, line items, acceptance, or payment holds.
- Visits use `POST /api/users/visit-requests`; a confirmed visit is an appointment only and does not reserve the rentable Space.
- Durable provider inquiry answers are read from `GET /api/users/date-inquiries/:id/messages`; push/outbox payloads are notification hints, not the source of truth.
- A provider-proposed alternative visit time has status `alternative_proposed`. Accept it with `POST /api/users/visit-requests/:id/alternative/accept` or reject it with `/alternative/reject`. Until acceptance it is not confirmed.
- Acceptance revalidates that the proposed appointment is still in the future. An elapsed proposal remains `alternative_proposed` and returns `422 REQUEST_TIME_INVALID`.
- Confirmed visits do not expire on the original provider-response deadline. They remain until completed, cancelled, or marked no-show.
- New request lists/details are `/api/users/booking-requests`, `/api/users/date-inquiries`, and `/api/users/visit-requests`.
- Keep existing Hall booking screens on `/api/users/bookings`; their envelope and actions remain compatible.
- Render Arabic names/status text first, then English, then the deterministic compatibility name. Treat `409` version/availability responses as refreshable workflow conflicts and never imply that a pending request has reserved the date.

# Sprint 5 pricing and quotes

Public active pricing is available from `GET /api/spaces/:spaceId/pricing`; all money fields are integer halalas serialized as decimal strings and currency is `SAR`. Do not parse them through JavaScript `Number`. Active packages include ordered customer-safe contents with Arabic-first fallback. Customer quote endpoints are under `/api/users/quotes`. Only sent revision history is visible, and provider internal notes are never returned.

Accept the current revision with `POST /api/users/quotes/:id/accept` and optionally send `revisionId` to detect stale revisions. Acceptance creates a temporary awaiting-payment hold but does not mark the Booking paid or confirmed. Decline with `POST /api/users/quotes/:id/decline`. Refresh after `QUOTE_REVISION_STALE`, `QUOTE_EXPIRED`, `INVENTORY_OVERLAP`, or `SPACE_NOT_APPROVABLE`.

## Sprint 6 payment contract

For an accepted Booking, call `GET /api/users/bookings/:bookingId/payable`. It returns authoritative `payableAmountMinor`, `bookingTotalMinor`, `remainingBalanceMinor`, SAR currency, purpose (`deposit` or `full_payment`), and cancellation policy. Monetary fields are decimal strings.

Initiate with `POST /api/users/bookings/:bookingId/payments` and `{ idempotencyKey }`, then poll `GET /api/users/payments/:id`. Never treat checkout completion, redirects, deep links, or local UI state as payment proof. Only a trusted server webhook makes the Booking `confirmed`. Deposit payment preserves a non-zero remaining balance; Sprint 6 does not collect it automatically.

Cancel an eligible confirmed Booking through `POST /api/users/bookings/:bookingId/paid-cancellation` with `reason` and `idempotencyKey`. Refund completion is asynchronous. `GET /api/users/payments/:id/receipt` becomes available only after trusted success and is not a ZATCA tax invoice.

Development/test fake checkout uses `qaaat-fake://`; production clients must not depend on that scheme or expose mark-paid controls.

Webhook completion can be delayed or replayed after checkout creation, so polling must tolerate `created`, `provider_pending`, and `unknown` without fabricating success. A `reconciliation_required` provider outcome is operational state, not customer-visible proof of payment. Receipt identity is display-only, excludes direct contact data, and remains immutable except for trusted refund totals/status.

Read an owned Refund and its latest bounded safe attempt history with `GET /api/users/refunds/:id`. Refund amounts remain canonical minor-unit strings. Customers cannot trigger PSP refund retries.
