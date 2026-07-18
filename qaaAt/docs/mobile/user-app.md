# QaaAt User App Integration Guide

This is the source-of-truth handoff for the customer-facing mobile app. It covers authentication, Space discovery, availability, booking requests, inquiries, visits, quotes, payments, refunds, notifications, and push registration as implemented on **2026-07-18**.

Development API references are available at `GET /docs` (Scalar) and `GET /openapi.json` (Outloud OpenAPI 3.1). The old `/api`, `/api.json`, and `/api.yaml` documentation endpoints no longer exist. Production documentation is disabled unless `OPENAPI_ENABLED=true`.

Read [README.md](./README.md) first for shared authentication, pagination, error normalization, rate limits, and backend setup.
When this guide and a shared or legacy document disagree about a customer endpoint, this guide and the live `GET /openapi.json` contract take precedence.

## Session isolation

Customer registration and login issue tokens with persisted `client:customer_app` context. Company-app and admin-app tokens are rejected from customer routes. A customer invited into a company keeps the same identity, password, and personal bookings, then signs into the company app separately for a company-scoped token.

## Public Space discovery

Approved controlled images include a server-owned `contentUrl` such as `/api/space-media/:mediaId/content`. Use that value directly and never construct media URLs from a storage key. Pending and rejected media is never public. Approved content uses long-lived immutable public caching, while eligibility still depends on the published Space, active Venue, and approved Company.

Use `GET /api/spaces` as the only customer discovery API. A Venue is a physical or business location; a Space is the independently bookable unit inside that Venue.

The endpoint accepts `q`, `category`, `city`, minimum `capacity`, comma-separated controlled `amenities` (AND semantics), `bookingMode`, `pricingMode`, `minimumPriceMinor`, `maximumPriceMinor`, explicit-offset `from`/`to`, `sessionCode`, `sort`, `page`, and `limit` (maximum 50). Capacity, page, and limit are integers. Price filters are canonical non-negative integer strings up to `9223372036854775807`; never convert them through JavaScript `Number`. Localized results prefer Arabic and fall back to English. Relevance ranks exact name, name prefix, name substring, then description, and requires `q`. When `from`/`to` are supplied, only Spaces with a valid authoritative availability candidate are returned; pagination remains page-based and may return `SPACE_DISCOVERY_WORK_LIMIT` when the 10 × 200 candidate scan ceiling cannot establish a truthful page.

## Space discovery and booking modes

`GET /api/space-catalog`, `GET /api/spaces`, `GET /api/spaces/:id`, and `GET /api/spaces/:id/availability` are the public discovery surface. Public Space endpoints return only published Spaces from approved companies. New arbitrary external media URLs are not accepted.

Choose the workflow from `Space.bookingMode`: use `/api/users/booking-requests` for `request_to_book` and `/api/users/date-inquiries` followed by quotes for `quote_required`. `instant_book` is not available for provider-created Spaces.

## Product flow

Availability comes from the Space schedule and inventory ledger. Pending/unapproved requests do not block slots; confirmed bookings, active holds, and operational blocks do. Public Space availability accepts explicit-offset `from`/`to` instants and is limited to 31 days.

1. Register and store `data.token.token` securely.
2. Ask for the six-digit email OTP and verify it. Browsing works before verification, but booking creation does not.
3. Browse published Spaces and fetch authoritative availability.
4. Submit the workflow appropriate to the selected Space: booking request, date inquiry, or visit request.
5. For quote-required Spaces, review the provider's sent quote and accept its current revision.
6. For an accepted Booking, fetch `/payable`, initiate payment idempotently, and poll the Payment until a trusted webhook confirms it.
7. Show authoritative Booking, Payment, Refund, and notification state; never infer completion from checkout or push payloads.

## Endpoint map

### Authentication and Space discovery

| Method | Path                                | Auth       | Purpose                        |
| ------ | ----------------------------------- | ---------- | ------------------------------ |
| POST   | `/api/users/register`               | Public     | Create customer account        |
| POST   | `/api/users/login`                  | Public     | Sign in                        |
| GET    | `/api/users/me`                     | User token | Restore account/profile        |
| POST   | `/api/users/logout`                 | User token | Revoke current token           |
| POST   | `/api/users/verify-email`           | Public     | Verify six-digit OTP           |
| POST   | `/api/users/resend-verification`    | Public     | Request another OTP            |
| GET    | `/api/space-catalog`                | Public     | Read controlled categories     |
| GET    | `/api/spaces`                       | Public     | Search published Spaces        |
| GET    | `/api/spaces/:id`                   | Public     | Read a published Space         |
| GET    | `/api/spaces/:id/availability`      | Public     | Read authoritative Space slots |
| GET    | `/api/space-media/:mediaId/content` | Public     | Read approved Space media      |

### Space requests, inquiries, visits, and quotes

| Method | Path                                               | Auth                | Purpose                           |
| ------ | -------------------------------------------------- | ------------------- | --------------------------------- |
| POST   | `/api/users/booking-requests`                      | Verified user token | Submit priced Space request       |
| GET    | `/api/users/booking-requests`                      | Verified user token | List own Space requests           |
| GET    | `/api/users/booking-requests/:id`                  | Verified user token | Read own Space request            |
| POST   | `/api/users/booking-requests/:id/cancel`           | Verified user token | Cancel pending Space request      |
| POST   | `/api/users/date-inquiries`                        | Verified user token | Submit date inquiry               |
| GET    | `/api/users/date-inquiries`                        | Verified user token | List own inquiries                |
| GET    | `/api/users/date-inquiries/:id`                    | Verified user token | Read own inquiry                  |
| GET    | `/api/users/date-inquiries/:id/messages`           | Verified user token | Read durable inquiry messages     |
| POST   | `/api/users/date-inquiries/:id/cancel`             | Verified user token | Cancel eligible inquiry           |
| POST   | `/api/users/visit-requests`                        | Verified user token | Request a visit                   |
| GET    | `/api/users/visit-requests`                        | Verified user token | List own visits                   |
| GET    | `/api/users/visit-requests/:id`                    | Verified user token | Read own visit                    |
| POST   | `/api/users/visit-requests/:id/cancel`             | Verified user token | Cancel eligible visit             |
| POST   | `/api/users/visit-requests/:id/alternative/accept` | Verified user token | Accept provider alternative       |
| POST   | `/api/users/visit-requests/:id/alternative/reject` | Verified user token | Reject provider alternative       |
| GET    | `/api/spaces/:spaceId/pricing`                     | Public              | Read active pricing and packages  |
| GET    | `/api/users/quotes`                                | Verified user token | List own quotes                   |
| GET    | `/api/users/quotes/:id`                            | Verified user token | Read own quote and sent revisions |
| POST   | `/api/users/quotes/:id/accept`                     | Verified user token | Accept current sent revision      |
| POST   | `/api/users/quotes/:id/decline`                    | Verified user token | Decline a sent quote              |

### Payments, notifications, and devices

| Method | Path                                               | Auth                | Purpose                               |
| ------ | -------------------------------------------------- | ------------------- | ------------------------------------- |
| GET    | `/api/users/bookings/:bookingId/payable`           | Verified user token | Read authoritative payable summary    |
| POST   | `/api/users/bookings/:bookingId/payments`          | Verified user token | Initiate idempotent payment           |
| POST   | `/api/users/bookings/:bookingId/paid-cancellation` | Verified user token | Cancel eligible paid Booking          |
| GET    | `/api/users/payments`                              | Verified user token | List own Payments                     |
| GET    | `/api/users/payments/:id`                          | Verified user token | Read own Payment                      |
| GET    | `/api/users/payments/:id/receipt`                  | Verified user token | Read immutable successful receipt     |
| GET    | `/api/users/refunds/:id`                           | Verified user token | Read own Refund and safe attempts     |
| GET    | `/api/users/notifications`                         | User token          | List notifications                    |
| GET    | `/api/users/notifications/unread-count`            | User token          | Get unread count                      |
| POST   | `/api/users/notifications/:id/read`                | User token          | Mark one read                         |
| POST   | `/api/users/notifications/read-all`                | User token          | Mark all read                         |
| POST   | `/api/users/push-installations`                    | Verified user token | Register or refresh this installation |
| DELETE | `/api/users/push-installations/:installationId`    | User token          | Revoke this installation              |

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

type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'completed'
  | 'payment_expired'
  | 'partially_refunded'
  | 'refunded'

type PaymentStatus = 'unpaid' | 'deposit_paid' | 'paid' | 'partially_refunded' | 'refunded'

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
  spaceNameSnapshot: { ar: string | null; en: string | null }
  venueNameSnapshot: { ar: string | null; en: string | null }
  categorySlugSnapshot: string
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

`totalPriceDecimal` is the exact canonical major-unit amount. `totalPriceMinor` is the immutable accepted Quote total when present. Numeric `totalPrice` is available only when minor units are within JavaScript's safe-integer range; otherwise it is `null` and clients must use the exact string fields.

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

`profile` can be `null`. Authentication responses use the explicit public profile contract and never expose profile ownership or persistence columns such as `userId`, `createdAt`, `updatedAt`, or `deletedAt`.

### Logout

`POST /api/users/logout` revokes only the current token and returns `{ "message": "Logged out successfully" }`.

## Notifications

All notification IDs are scoped to the authenticated account.

### List

`GET /api/users/notifications?page=1&limit=20&unread_only=true`

Returns `{ data: Notification[], meta }`, newest first. `unread_only` is true only when sent as boolean `true` or string `"true"`.

Current customer flows emit notification families for Booking decisions/expiry, inquiry answers/cancellation/expiry, visit alternatives/cancellation/expiry, quote send/withdraw/expiry, and payment/refund outcomes. Examples include `booking_accepted`, `date_inquiry_answered`, `visit_alternative_accepted`, `quote_sent`, `payment_succeeded`, and `refund_succeeded`. The type column remains extensible, so route known types when possible and render unknown values generically.

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
- Disable duplicate booking submissions while the first request is in flight; persist and reuse the idempotency key for retries.
- Do not present profile editing or password reset until their backend endpoints exist.

## Space request workflows

- For a published Space with `bookingMode=request_to_book`, first read `GET /api/spaces/:spaceId/pricing`, then submit to `POST /api/users/booking-requests`. Send `ratePlanId` when more than one compatible active plan is offered. The field is optional only when the server can resolve exactly one compatible plan. The server reads the selected plan, calculates VAT and totals, and stores an immutable pricing snapshot; clients never submit monetary values. Persist and reuse `idempotencyKey` for retries. Pending requests may overlap and do not reserve inventory.
- For date-first or `quote_required` experiences, submit `POST /api/users/date-inquiries`, then read the provider's quote through `/api/users/quotes`. Inquiry creation itself never reserves inventory.
- Visits use `POST /api/users/visit-requests`; a confirmed visit is an appointment only and does not reserve the rentable Space.
- Durable provider inquiry answers are read from `GET /api/users/date-inquiries/:id/messages`; push/outbox payloads are notification hints, not the source of truth.
- A provider-proposed alternative visit time has status `alternative_proposed`. Accept it with `POST /api/users/visit-requests/:id/alternative/accept` or reject it with `/alternative/reject`. Until acceptance it is not confirmed.
- Acceptance revalidates that the proposed appointment is still in the future. An elapsed proposal remains `alternative_proposed` and returns `422 REQUEST_TIME_INVALID`.
- Confirmed visits do not expire on the original provider-response deadline. They remain until completed, cancelled, or marked no-show.
- New request lists/details are `/api/users/booking-requests`, `/api/users/date-inquiries`, and `/api/users/visit-requests`.
- Render Arabic names/status text first, then English. Treat `409` version/availability responses as refreshable workflow conflicts and never imply that a pending request has reserved the date.

## Pricing and quotes

Public active pricing is available from `GET /api/spaces/:spaceId/pricing`; all money fields are integer halalas serialized as decimal strings and currency is `SAR`. Do not parse them through JavaScript `Number`. Active packages include ordered customer-safe contents with Arabic-first fallback. Customer quote endpoints are under `/api/users/quotes`. Only sent revision history is visible, and provider internal notes are never returned.

Accept the current revision with `POST /api/users/quotes/:id/accept` and optionally send `revisionId` to detect stale revisions. Acceptance creates a temporary awaiting-payment hold but does not mark the Booking paid or confirmed. Decline with `POST /api/users/quotes/:id/decline`. Refresh after `QUOTE_REVISION_STALE`, `QUOTE_EXPIRED`, `INVENTORY_OVERLAP`, or `SPACE_NOT_APPROVABLE`.

## Payments and refunds

For an accepted Booking, call `GET /api/users/bookings/:bookingId/payable`. It returns authoritative `payableAmountMinor`, `bookingTotalMinor`, `remainingBalanceMinor`, SAR currency, purpose (`deposit` or `full_payment`), immutable `lineItems`, VAT inclusion/rate/amount, and cancellation policy. Monetary fields are decimal strings. Catalog changes after request submission do not change the Booking snapshot.

Initiate with `POST /api/users/bookings/:bookingId/payments` and `{ idempotencyKey }`, list history with `GET /api/users/payments`, then poll `GET /api/users/payments/:id`. Never treat checkout completion, redirects, deep links, or local UI state as payment proof. Only a trusted server webhook makes the Booking `confirmed`. Deposit payment preserves a non-zero remaining balance; automatic collection of that remaining balance is not implemented.

Cancel an eligible confirmed Booking through `POST /api/users/bookings/:bookingId/paid-cancellation` with `reason` and `idempotencyKey`. Refund completion is asynchronous. `GET /api/users/payments/:id/receipt` becomes available only after trusted success and is not a ZATCA tax invoice.

Development/test fake checkout uses `qaaat-fake://`; production clients must not depend on that scheme or expose mark-paid controls.

Webhook completion can be delayed or replayed after checkout creation, so polling must tolerate `created`, `provider_pending`, and `unknown` without fabricating success. A `reconciliation_required` provider outcome is operational state, not customer-visible proof of payment. Receipt identity is display-only, excludes direct contact data, and remains immutable except for trusted refund totals/status.

Read an owned Refund and its latest bounded safe attempt history with `GET /api/users/refunds/:id`. Refund amounts remain canonical minor-unit strings. Customers cannot trigger PSP refund retries.

## Support disputes and catalog administration

Payment disputes are currently operated by administrators only. The customer app has no dispute create, list, or transition endpoint and must not infer a dispute from payment or refund state. A support dispute never changes the authoritative Booking, Payment, or Refund state; continue polling the documented customer endpoints. Do not add a dispute submission UI until a customer-facing contract is explicitly introduced.

Administrators can change controlled category/amenity labels, order, searchability, and active state. Always refresh `GET /api/space-catalog` instead of shipping a permanent local catalog. An inactive definition may disappear from discovery without deleting historical bookings or snapshots.

## Canonical customer API contract

This section is normative for mobile implementation. Unless an endpoint below says otherwise, request and response JSON keys are camelCase, protected routes require `Authorization: Bearer <customer-token>`, and a successful resource response is `{ "data": ... }`. List responses are `{ "data": [...], "meta": PaginationMeta }`. `204` responses have no body. Raw inquiry, visit, quote, and some finance rows are the deliberate exceptions: their database-backed response keys are snake_case and are listed explicitly below.

### Common rules

- Send `Accept: application/json`; also send `Content-Type: application/json` for JSON bodies.
- Every request/visit instant must be ISO 8601 with an explicit `Z` or `±HH:mm` offset. The server converts it to UTC and preserves the Venue-local snapshot and IANA timezone.
- IDs for normal resources are numbers. Payment, refund, and attempt IDs are serialized as decimal strings where stated.
- Money is SAR minor units (halalas) encoded as canonical non-negative decimal strings. Never pass these fields through JavaScript `Number`.
- Creation idempotency keys are trimmed strings of 8–120 characters for requests and 8–180 characters for payments/cancellations. Reuse the same key only with the byte-equivalent logical payload. Conflicting reuse returns `409 IDEMPOTENCY_KEY_REUSED` or `409 PAYMENT_IDEMPOTENCY_CONFLICT`.
- Pagination defaults to `page=1&limit=20`; customer lists clamp `limit` to 100, while discovery clamps it to 50.
- A Lucid ownership miss normally returns `404 RESOURCE_NOT_FOUND`; deliberate domain misses use the more specific code documented below.

### Public catalog and Space schemas

`GET /api/space-catalog` returns:

```ts
type SpaceCatalog = {
  categories: Array<{ id: number; slug: string; nameAr: string; nameEn: string }>
  amenities: Array<{
    id: number
    slug: string
    nameAr: string
    nameEn: string
    group: string
    isSearchable: boolean
  }>
}
// { data: SpaceCatalog }
```

`GET /api/spaces` query contract:

```ts
type SpaceDiscoveryQuery = {
  q?: string // trimmed, max 120
  category?: string // active catalog slug, max 80
  city?: string // case-insensitive exact match, max 120
  capacity?: number // positive integer, <= 1,000,000
  amenities?: string // comma-separated active slugs; all must match
  bookingMode?: 'request_to_book' | 'quote_required' | 'instant_book'
  pricingMode?: 'hourly' | 'fixed_session' | 'half_day' | 'full_day' | 'package' | 'custom_quote'
  minimumPriceMinor?: string // 0..9223372036854775807
  maximumPriceMinor?: string // 0..9223372036854775807
  from?: string // must be paired with to; explicit-offset instant
  to?: string
  sessionCode?: string // lowercase letters, digits, underscore; max 80
  sort?: 'relevance' | 'newest' | 'capacity' | 'price_asc' | 'price_desc'
  page?: number // 1..10,000 integer
  limit?: number // 1..50 integer
}

type DiscoverySpace = {
  id: number
  venueId: number
  name: string | null
  description: string | null
  venueName: string | null
  category: { slug: string; label: string | null }
  bookingMode: 'request_to_book' | 'quote_required' | 'instant_book'
  location: { city: string; district: string | null; display: string }
  capacity: { maximumAttendance: number }
  amenities: string[]
  coverMedia: null | {
    id: number
    type: 'image'
    contentUrl: string
    altTextAr: string | null
    altTextEn: string | null
  }
  pricing: {
    startingPriceMinor: string | null
    currency: 'SAR'
    supportedModes: string[]
    pricesIncludeVat: boolean | null
  }
  availability?: Availability
}

type DiscoveryMeta = {
  page: number
  limit: number
  hasNextPage: boolean
  availabilityScan?: {
    batchSize: 200
    maximumBatches: 10
    batchesScanned: number
    scannedCandidates: number
    exhausted: boolean
  }
}
// { data: DiscoverySpace[], meta: DiscoveryMeta }
```

Default sort is `relevance` when `q` exists and `newest` otherwise. Explicit `sort=relevance` without `q` returns `RELEVANCE_QUERY_REQUIRED`. Price bounds are applied to the minimum active non-custom rate-plan price. Supplying `from` and `to` filters out Spaces with no available slot and adds `availability` to every result.

`GET /api/spaces/:id` returns `{ data: Space }`:

```ts
type Space = {
  id: number
  companyId: number
  venueId: number
  name: string | null
  nameAr: string | null
  nameEn: string | null
  description: string | null
  descriptionAr: string | null
  descriptionEn: string | null
  category?: { slug: string; nameAr: string; nameEn: string }
  bookingMode: 'request_to_book' | 'quote_required'
  publicationStatus: 'published'
  capacityTotal: number
  requiresVisit: boolean
  minimumDurationMinutes: number | null
  maximumDurationMinutes: number | null
  minimumNoticeHours: number | null
  venue?: {
    id: number
    companyId: number
    name: string | null
    nameAr: string | null
    nameEn: string | null
    city: string
    district: string | null
    street: string | null
    buildingNumber: string | null
    postalCode: string | null
    additionalNumber: string | null
    accessInstructions: { ar: string | null; en: string | null }
    parkingNotes: { ar: string | null; en: string | null }
    latitude: number | null
    longitude: number | null
    verificationStatus: string
    timezone: string
    createdAt: string
    updatedAt: string | null
  }
  eventDetails?: {
    maleCapacity: number | null
    femaleCapacity: number | null
    hasSeparateEntrances: boolean
    hasBridalRoom: boolean
    hasStage: boolean
  }
  layoutCapacities?: Array<{ layout: string; capacity: number }>
  largeFormatDetails?: {
    floorAreaSqm: number | null
    ceilingHeightM: number | null
    hasLoadingAccess: boolean
    visitorCapacity: number | null
    powerRequirement: string | null
  }
  amenities?: Array<{ id: number; slug: string; nameAr: string; nameEn: string }>
  media?: Array<{
    id: number
    type: 'image'
    contentUrl: string
    altTextAr: string | null
    altTextEn: string | null
    sortOrder: number
    isCover: boolean
  }>
  createdAt: string
  updatedAt: string | null
}
```

`GET /api/space-media/:mediaId/content` returns image bytes, not JSON. Use the response `Content-Type`; approved public media is cacheable and inaccessible once its Space/company/publication eligibility is lost.

### Availability

`GET /api/spaces/:id/availability` requires `from` and `to`; optional `durationMinutes` and `durationDays` are numeric query values. The range is at most 31 days. `durationMinutes` must satisfy the Space policy; `durationDays` is an integer from 1 to 31 and matters to multi-day mode.

```ts
type Availability = {
  spaceId: number
  timezone: string
  mode: 'hourly' | 'session' | 'full_day' | 'multi_day' | null
  slots: Array<{
    startAt: string // UTC ISO
    endAt: string // UTC ISO
    localStart: string // Venue-local ISO with offset
    localEnd: string
    code: string | null
    nameAr: string | null
    nameEn: string | null
    isAvailable: boolean
  }>
}
// { data: Availability }
```

No policy returns `mode: null` and an empty slot array. Important errors are `AVAILABILITY_RANGE_INVALID`, `AVAILABILITY_RANGE_LIMIT`, `AVAILABILITY_DURATION_INVALID`, `AVAILABILITY_MULTI_DAY_LIMIT`, `AVAILABILITY_SLOT_LIMIT`, and `SPACE_NOT_FOUND`.

### Public pricing

`GET /api/spaces/:spaceId/pricing` returns:

```ts
type PublicPricing = {
  currency: 'SAR'
  ratePlans: Array<{
    id: number
    name: string | null
    nameAr: string | null
    nameEn: string | null
    pricingMode: string
    priceMinor: string | null
    pricesIncludeVat: boolean
    vatRateBps: number
    currency: 'SAR'
  }>
  packages: Array<{
    id: number
    name: string | null
    nameAr: string | null
    nameEn: string | null
    description: string | null
    descriptionAr: string | null
    descriptionEn: string | null
    basePriceMinor: string
    pricesIncludeVat: boolean
    vatRateBps: number
    currency: 'SAR'
    items: Array<{
      itemType: string
      description: string | null
      descriptionAr: string | null
      descriptionEn: string | null
      quantity: number
      isIncluded: boolean
    }>
  }>
  serviceOptions: Array<{
    id: number
    name: string | null
    nameAr: string | null
    nameEn: string | null
    description: string | null
    descriptionAr: string | null
    descriptionEn: string | null
    priceMinor: string
    pricesIncludeVat: boolean
    vatRateBps: number
    currency: 'SAR'
  }>
}
```

Only active, non-archived, Space-attached public records are returned.

### Booking-request endpoints

Create body for `POST /api/users/booking-requests`:

```ts
type CreateBookingRequest = {
  spaceId: number
  ratePlanId?: number
  startsAt: string
  endsAt: string
  sessionCode?: string // max 80
  eventType: string // 2..80
  attendance: number // positive, <=100,000
  contactPreference: 'in_app' | 'email' | 'phone'
  notes?: string // max 2,000
  idempotencyKey: string // 8..120
}
```

Success is `201 { message: "تم إرسال طلب الحجز", data: Booking }`. The server requires a published `request_to_book` Space, validates the authoritative schedule, resolves the applicable active rate plan, calculates VAT/totals, snapshots identity/catalog/pricing, and creates a `pending` Booking. It does not block inventory.

`GET /api/users/booking-requests?page&limit` returns own `Booking[]`; `GET /:id` returns one own Booking. `POST /:id/cancel` has no body and returns the updated Booking. Customer cancellation is allowed from `pending`, `accepted`, or an unpaid `confirmed` Booking; a paid confirmed Booking returns `CANCELLATION_PAYMENT_FLOW_REQUIRED` and must use the separate paid-cancellation endpoint.

Additional `Booking` fields used by these endpoints are:

```ts
type Booking = {
  id: number
  requestReference: string
  companyId: number
  venueId: number
  spaceId: number
  bookingDate: string
  startTime: string
  endTime: string
  startsAt: string
  endsAt: string
  timezone: string
  status: BookingStatus
  paymentStatus: PaymentStatus
  specialRequests: string | null
  rejectionReason: string | null
  eventType: string | null
  attendance: number | null
  contactPreference: 'in_app' | 'email' | 'phone'
  companyRespondedAt: string | null
  responseExpiresAt: string | null
  expiresAt: string | null
  paymentDueDate: string | null
  lockVersion: number
  totalPrice: number | null
  totalPriceDecimal: string | null
  totalPriceMinor: string | null
  isExpired: boolean
  spaceNameSnapshot: { ar: string | null; en: string | null }
  venueNameSnapshot: { ar: string | null; en: string | null }
  categorySlugSnapshot: string
  createdAt: string
  updatedAt: string | null
}
```

Creation/approval errors to handle explicitly include `SPACE_NOT_BOOKABLE`, `SPACE_BOOKING_MODE_MISMATCH`, `REQUEST_TIME_INVALID`, `AVAILABILITY_POLICY_MISSING`, `AVAILABILITY_SCHEDULE_CONFLICT`, `RATE_PLAN_REQUIRED`, `RATE_PLAN_INVALID`, `RATE_PLAN_MODE_MISMATCH`, `IDEMPOTENCY_KEY_REUSED`, `BOOKING_EXPIRED`, and inventory conflict codes.

### Inquiry endpoints and raw response schema

Create body for `POST /api/users/date-inquiries`:

```ts
type CreateDateInquiry = {
  spaceId: number
  preferredStartsAt: string
  preferredEndsAt: string
  subject: string // 3..180
  message?: string // max 2,000
  eventType?: string // 2..80
  attendance?: number // positive, <=100,000
  contactPreference: 'in_app' | 'email' | 'phone'
  idempotencyKey: string // 8..120
}
```

Success is `201 { message: "تم إرسال استفسار الموعد", data: Inquiry }`. List/detail/cancel return the same raw snake_case row:

```ts
type InquiryStatus =
  'open' | 'under_review' | 'answered' | 'closed' | 'cancelled' | 'rejected' | 'expired'
type Inquiry = {
  id: number
  reference: string
  company_id: number
  venue_id: number
  space_id: number
  user_id: number
  kind: 'date_inquiry'
  status: InquiryStatus
  subject: string
  initial_message: string | null
  event_type: string | null
  attendance: number | null
  preferred_starts_at: string
  preferred_ends_at: string
  original_start_local: string
  original_end_local: string
  original_timezone: string
  space_name_snapshot_ar: string | null
  space_name_snapshot_en: string | null
  venue_name_snapshot_ar: string | null
  venue_name_snapshot_en: string | null
  customer_name_snapshot: string | null
  customer_email_snapshot: string | null
  contact_preference: 'in_app' | 'email' | 'phone'
  lock_version: number
  response_expires_at: string
  answered_at: string | null
  closed_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string | null
  deleted_at: null
}
```

`GET /api/users/date-inquiries/:id/messages?page&limit` returns ascending `{ id, sender_type, body, created_at }[]` with pagination. `POST /:id/cancel` has no body and is valid from `open`, `under_review`, or `answered`. Relevant conflicts are `SPACE_INQUIRY_MODE_MISMATCH`, `REQUEST_TIME_INVALID`, and `INQUIRY_INVALID_TRANSITION`.

### Visit endpoints and raw response schema

Create body for `POST /api/users/visit-requests`:

```ts
type CreateVisitRequest = {
  spaceId: number
  startsAt: string
  endsAt: string
  notes?: string // max 2,000
  inquiryId?: number // must be own, same Company and Space
  bookingId?: number // must be own, same Company and Space
  idempotencyKey: string // 8..120
}
```

Success is `201 { message: "تم إرسال طلب الزيارة", data: VisitRequest }`. List/detail/actions return raw snake_case rows:

```ts
type VisitStatus =
  | 'submitted'
  | 'alternative_proposed'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'expired'
type VisitRequest = {
  id: number
  reference: string
  company_id: number
  venue_id: number
  space_id: number | null
  user_id: number
  inquiry_id: number | null
  booking_id: number | null
  status: VisitStatus
  starts_at: string
  ends_at: string
  proposed_starts_at: string | null
  proposed_ends_at: string | null
  proposed_start_local: string | null
  proposed_end_local: string | null
  original_start_local: string
  original_end_local: string
  original_timezone: string
  customer_name_snapshot: string | null
  customer_email_snapshot: string | null
  customer_notes: string | null
  provider_notes: string | null
  status_reason: string | null
  lock_version: number
  response_expires_at: string
  confirmed_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string | null
  deleted_at: null
}
```

`POST /:id/cancel`, `/alternative/accept`, and `/alternative/reject` have no body. Cancel is valid from `submitted`, `alternative_proposed`, or `confirmed`. Alternative acceptance changes the authoritative interval and sets `confirmed`; rejection sets `cancelled`. Handle `VISIT_INVALID_TRANSITION`, `VISIT_TIME_CONFLICT`, `REQUEST_TIME_INVALID`, and `IDEMPOTENCY_KEY_REUSED`.

### Quote endpoints and schema

`GET /api/users/quotes?page&limit` excludes drafts. Detail returns only `sent` and `superseded` revisions; it never returns `internal_notes`. Quote JSON intentionally uses snake_case:

```ts
type QuoteStatus = 'sent' | 'accepted' | 'customer_declined' | 'expired' | 'withdrawn'
type QuoteLine = {
  id: number
  item_type: 'rate_plan' | 'package' | 'service' | 'adjustment'
  description_ar: string | null
  description_en: string | null
  quantity: number
  unit_price_minor: string
  subtotal_minor: string
  discount_minor: string
  vat_rate_bps: number
  vat_minor: string
  total_minor: string
  currency: 'SAR'
  prices_include_vat: boolean
  sort_order: number
}
type QuoteRevision = {
  id: number
  revision_number: number
  status: 'sent' | 'superseded'
  subtotal_minor: string
  discount_minor: string
  vat_minor: string
  total_minor: string
  currency: 'SAR'
  prices_include_vat: boolean
  vat_rate_bps: number
  deposit_percent: number | null
  deposit_minor: string | null
  remaining_minor: string | null
  expires_at: string | null
  sent_at: string | null
  created_at: string
  line_items?: QuoteLine[]
}
type CustomerQuote = {
  id: number
  reference: string
  company_id: number
  venue_id: number
  space_id: number
  inquiry_id: number
  visit_request_id: number | null
  booking_id: number | null
  status: QuoteStatus
  current_revision_id: number
  accepted_revision_id: number | null
  starts_at: string
  ends_at: string
  start_local: string
  end_local: string
  timezone: string
  space_name_ar: string | null
  space_name_en: string | null
  venue_name_ar: string | null
  venue_name_en: string | null
  customer_request_snapshot: string | null
  sent_at: string | null
  accepted_at: string | null
  declined_at: string | null
  withdrawn_at: string | null
  expired_at: string | null
  created_at: string
  updated_at: string | null
  revisions?: QuoteRevision[]
}
```

`POST /api/users/quotes/:id/accept` and `/decline` accept `{ "revisionId"?: number, "reason"?: string }`; `reason` is 3–1,000 characters. On accept, optional `revisionId` is an optimistic stale check. Success returns `{ data: CustomerQuote }`; acceptance also creates an accepted Booking and temporary inventory hold referenced by `booking_id`. Handle `QUOTE_INVALID_TRANSITION`, `QUOTE_REVISION_STALE`, `QUOTE_EXPIRED`, `QUOTE_ALREADY_ACCEPTED`, `SPACE_NOT_APPROVABLE`, and `INVENTORY_OVERLAP`.

### Payment, receipt, cancellation, and Refund schemas

```ts
type Payable = {
  bookingId: number
  status: BookingStatus
  currency: 'SAR'
  purpose: 'deposit' | 'full_payment'
  payableAmountMinor: string
  bookingTotalMinor: string
  remainingBalanceMinor: string
  lineItems: Array<{
    itemType: string
    descriptionAr: string | null
    descriptionEn: string | null
    quantity: number
    unitPriceMinor: string
    subtotalMinor: string
    discountMinor: string
    vatRateBps: number
    vatMinor: string
    totalMinor: string
    pricesIncludeVat: boolean
  }>
  pricesIncludeVat: boolean | null
  vatRateBps: number | null
  vatMinor: string | null
  cancellationPolicy: null | {
    id: number
    version: number
    name: string
    tiers: Array<{ minimumHours: number; refundPercent: number }>
    depositNonRefundable: boolean
  }
}

type Payment = {
  id: string
  reference: string
  bookingId: number
  purpose: 'deposit' | 'full_payment'
  status: 'pending' | 'paid' | 'partially_refunded' | 'refunded'
  currency: 'SAR'
  expectedAmountMinor: string
  bookingTotalMinor: string
  amountPaidMinor: string
  amountRefundedMinor: string
  remainingBalanceMinor: string
  attempt: null | {
    id: string
    reference: string
    status:
      'created' | 'provider_pending' | 'succeeded' | 'failed' | 'unknown' | 'cancelled' | 'expired'
    checkoutUrl: string | null
    expiresAt: string | null
  }
}

type Refund = {
  id: string
  reference: string
  paymentId: string
  bookingId: number
  status: 'requested' | 'provider_pending' | 'succeeded' | 'failed' | 'cancelled'
  requestedAmountMinor: string
  approvedAmountMinor: string
  currency: 'SAR'
  reason: string
  createdAt: string
  processedAt: string | null
  attempts: Array<{
    id: string
    reference: string
    status: string
    failureCode: string | null
    failureMessage: string | null
    createdAt: string
    updatedAt: string | null
    processedAt: string | null
  }>
}
```

Endpoint-specific behavior:

| Endpoint                                                | Input                                                         | Success                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| `GET /api/users/bookings/:bookingId/payable`            | none                                                          | `200 { data: Payable }`                                         |
| `POST /api/users/bookings/:bookingId/payments`          | `{ idempotencyKey: string(8..180) }`                          | `200 { data: Payment }`                                         |
| `GET /api/users/payments?page&limit`                    | pagination                                                    | `200 { data: Payment[], meta }`; list rows have `attempt: null` |
| `GET /api/users/payments/:id`                           | none                                                          | `200 { data: Payment }` with latest attempt                     |
| `GET /api/users/payments/:id/receipt`                   | none                                                          | `200 { data: Receipt }`; only after trusted success             |
| `POST /api/users/bookings/:bookingId/paid-cancellation` | `{ reason: string(3..1000), idempotencyKey: string(8..180) }` | `200 { data: { status: 'not_required', amountMinor: '0' }       | { reference: string, status: 'requested', amountMinor: string } }` |
| `GET /api/users/refunds/:id`                            | none                                                          | `200 { data: Refund }`; latest 20 safe attempts                 |

`Receipt` is the immutable provider-success snapshot (receipt reference, booking/customer/provider display identity, line items, exact totals, VAT display, payment timestamps/status) plus `amountRefundedMinor` and nullable `refundStatus`. Treat its snapshot keys as immutable display data, not editable account data.

Important payment errors are `BOOKING_NOT_FOUND`, `BOOKING_NOT_PAYABLE`, `PAYMENT_HOLD_EXPIRED`, `CANCELLATION_POLICY_REQUIRED`, `PAYMENT_ALREADY_COMPLETED`, `PAYMENT_ATTEMPT_ACTIVE`, `PAYMENT_IDEMPOTENCY_CONFLICT`, `PAYMENT_NOT_FOUND`, `CANCELLATION_NOT_ALLOWED`, `REFUND_NOT_ALLOWED`, and `REFUND_NOT_FOUND`.

### Notification and push schemas

`GET /api/users/notifications` supports `page`, `limit`, and snake_case `unread_only`. Notification type is an extensible string. Push registration input is exactly:

```ts
type RegisterPushInstallation = {
  installationId: string // 8..128, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
  expoPushToken: string // valid Expo token, max 255
  platform: 'ios' | 'android'
  deviceName?: string // max 120
  appVersion?: string // max 40
}
type PushInstallation = {
  installationId: string
  platform: 'ios' | 'android'
  deviceName: string | null
  appVersion: string | null
  notificationsEnabled: boolean
  lastSeenAt: string
}
```

Store returns `200 { message, data: PushInstallation }`; delete returns `204` and is intentionally idempotent.

## Customer state machines

```text
Booking request: pending -> accepted -> confirmed -> completed
                         \-> rejected
             pending/accepted -> cancelled
             pending -> expired
             accepted -> payment_expired
             confirmed -> cancelled -> partially_refunded/refunded (payment state is separate)

Inquiry: open -> under_review -> answered -> closed
         open/under_review -> rejected
         open/under_review/answered -> cancelled
         open/under_review -> expired

Visit: submitted -> confirmed -> completed | no_show | cancelled
       submitted -> alternative_proposed -> confirmed | cancelled
       submitted -> rejected | cancelled | expired

Quote: sent -> accepted | customer_declined | withdrawn | expired

Payment attempt: created -> provider_pending -> succeeded | failed | unknown
Refund: requested -> provider_pending -> succeeded | failed | unknown
```

The app must always re-fetch after a mutation or notification. State transitions are server-authoritative and can change asynchronously through expiry jobs and trusted payment/refund webhooks.

## Complete error contract

All current validation and domain failures use:

```ts
type ApiError = {
  error: {
    code: string
    message: string
    details?: Array<{ message: string; rule?: string; field?: string; meta?: unknown }>
  }
}
```

Authentication without a usable token returns `401 UNAUTHORIZED`; a deleted account returns `401 ACCOUNT_INACTIVE`; bad login returns `401 INVALID_CREDENTIALS`; a company/admin token on customer routes returns `403 CUSTOMER_REQUIRED`; unverified workflow calls return `403 EMAIL_NOT_VERIFIED`; validation returns `422 VALIDATION_ERROR`; rate limiting returns `429` and should honor `Retry-After`. Preserve unknown codes and show `message` as the safe fallback.
