# QaaAt Company App Integration Guide

This is the source-of-truth handoff for the company-facing mobile app. It covers authentication, memberships, invitations, Venues, Spaces, controlled media, calendar and inventory, request workflows, pricing, quotes, finance, notifications, and push registration as implemented on **2026-07-18**.

Development API references are available at `GET /docs` (Scalar) and `GET /openapi.json` (Outloud OpenAPI 3.1). The old `/api`, `/api.json`, and `/api.yaml` documentation endpoints no longer exist. Production documentation is disabled unless `OPENAPI_ENABLED=true`.

Read [README.md](./README.md) first for shared authentication, pagination, error normalization, rate limits, and backend setup.
When this guide and a shared or legacy document disagree about a company endpoint, this guide and the live `GET /openapi.json` contract take precedence.

## Membership and session contract

Company-app tokens persist `client:company_app` and `company:{id}` abilities. Customer-app tokens are rejected on company routes. A shared User may retain `userType: "user"` and still sign in here with an active membership.

Company authorization is membership-only. Every protected company request must present exactly one valid `company:{id}` scope, and the authenticated User must have an active membership for that Company. `userType: "company"`, the legacy `companies.userId` link, wildcard tokens, and request-time membership repair never grant access. Missing or ambiguous scope returns `COMPANY_SCOPE_REQUIRED`; a missing/inactive membership returns `COMPANY_MEMBERSHIP_REQUIRED`.

`POST /api/companies/login` accepts only `email` and `password`. It returns `user`, `company`, `membership`, and `token`; there is no company selector or `memberships` array. A User may have at most one current (`active` or `suspended`) company membership. Revoked memberships remain historical and allow a later invitation to another Company.

- `GET /api/companies/members` requires `members.view`.
- `PATCH /api/companies/members/:id` accepts optional `role`, `status`, and `permissionOverrides`; it requires `members.manage`.
- `DELETE /api/companies/members/:id` revokes membership, its company-app sessions, and active company-app push installations. Customer sessions and customer-app push installations remain valid.
- `GET /api/companies/invitations` requires `members.view`.
- `POST /api/companies/invitations` accepts required `name`, required `email`, `role`, and optional overrides. Phone-only invitations are intentionally rejected until verified SMS delivery and phone-based authentication exist.
- `POST /api/companies/invitations/:id/resend` rotates the acceptance token.
- `DELETE /api/companies/invitations/:id` cancels a pending invitation.

Roles are `owner`, `manager`, `booking_staff`, `calendar_staff`, `accountant`, and `viewer`. Overrides use `{ permission, effect: "allow" | "deny" }`; deny wins. The final active owner cannot be removed or demoted. Only an owner can invite/promote/modify an owner or grant `payout_settings.manage`. Other members can delegate only effective permissions they already hold.

Public/auth-assisted acceptance uses `GET /api/company-invitations/inspect?token=...` and `POST /api/company-invitations/accept`. The acceptance secret is never returned by create, resend, or list APIs; it is delivered only to the invited mailbox through the notification outbox. For a genuinely new identity, the one-time hashed and expiring mailbox-delivered secret proves control of the invited email, and the employee supplies `password` plus optional `name`. The server creates the account using the locked invitation email, never a caller-supplied email. Existing users must authenticate normally, and acceptance never changes an existing password.

## Venue and Space contract

A Venue is the physical or business location. A Space is the independently bookable unit inside a Venue. The mobile app must use this contract exclusively.

- `GET/POST /api/companies/venues`
- `GET/PATCH /api/companies/venues/:id`
- `GET/POST /api/companies/spaces`
- `GET/PATCH/DELETE /api/companies/spaces/:id`
- `POST /api/companies/spaces/:id/submissions`
- `GET /api/space-catalog`

Reads require `spaces.view`; writes require `spaces.manage` and an approved company. Every operation is scoped to the company selected by the company-app token.

Venue and Space names use `{ ar?, en? }` and require at least one value. Responses derive `name` deterministically as Arabic, then English.

Publication states are `draft`, `pending_review`, `changes_requested`, `published`, `suspended`, and `archived`. Providers edit `draft` or `changes_requested`, then resubmit. Editing a published Space moves it directly to `pending_review` and hides it from public discovery until an admin republishes it. Suspended and archived Spaces cannot be edited. Admins publish, request changes with a reason, suspend a published Space, or restore it. Providers cannot activate `instant_book`.

Controlled Space media upload is live under `/api/companies/spaces/:spaceId/media`. Images use verified private storage and moderation. Arbitrary remote URLs are not accepted by Space media APIs.

## Product flow

Calendar configuration uses weekly rules and date exceptions; a `closed` exception only changes offered schedule and is not an inventory record. External confirmed reservations, external holds, maintenance, operational closures, and internal events are separate auditable blocks. Calendar reads require `calendar.view`; writes require `calendar.manage`. External reservation deletion means cancellation/release, never hard deletion. Company calendar ranges are limited to 93 days and 100 rows per page.

1. Register with legal/business details and a scanned commercial-registration PDF.
2. Store the returned token and route by `data.company.status`; a new company starts as `pending`.
3. Pending or rejected companies can restore account state and read notifications, but cannot mutate catalog or access booking management.
4. Approved companies can create and manage Venues and Spaces, receive booking requests, and accept or reject pending requests.
5. Admin suspension revokes existing access tokens and blocks future login.

## Endpoint map

All protected company routes require an active membership and exactly one company-scoped token. Permission names below are additional requirements. An approved Company is required for Venue/Space/media/calendar mutations and every request, pricing, quote, and finance route. Read-only membership, invitation, notification, Venue/Space/media, and calendar endpoints remain available according to their individual middleware; invitation create/resend additionally require approval.

### Authentication, membership, and communication

| Method | Path                                                | Requirement                 | Purpose                               |
| ------ | --------------------------------------------------- | --------------------------- | ------------------------------------- |
| POST   | `/api/companies/register`                           | Public multipart            | Create pending Company and owner      |
| POST   | `/api/companies/login`                              | Public                      | Sign in through the single membership |
| GET    | `/api/companies/me`                                 | Company token               | Refresh Company and permissions       |
| POST   | `/api/companies/logout`                             | Company token               | Revoke current token                  |
| GET    | `/api/companies/members`                            | `members.view`              | List current members                  |
| PATCH  | `/api/companies/members/:id`                        | `members.manage`            | Update role, status, or overrides     |
| DELETE | `/api/companies/members/:id`                        | `members.manage`            | Revoke membership                     |
| GET    | `/api/companies/invitations`                        | `members.view`              | List invitations                      |
| POST   | `/api/companies/invitations`                        | Approved + `members.manage` | Create email invitation               |
| POST   | `/api/companies/invitations/:id/resend`             | Approved + `members.manage` | Rotate and redeliver invitation       |
| DELETE | `/api/companies/invitations/:id`                    | `members.manage`            | Cancel pending invitation             |
| GET    | `/api/company-invitations/inspect`                  | Public                      | Inspect masked invitation             |
| POST   | `/api/company-invitations/accept`                   | Public/optional auth        | Accept or create invited identity     |
| GET    | `/api/companies/notifications`                      | Company token               | List Company notifications            |
| GET    | `/api/companies/notifications/unread-count`         | Company token               | Get unread count                      |
| POST   | `/api/companies/notifications/:id/read`             | Company token               | Mark one read                         |
| POST   | `/api/companies/notifications/read-all`             | Company token               | Mark all read                         |
| POST   | `/api/companies/push-installations`                 | Company token               | Register or refresh installation      |
| DELETE | `/api/companies/push-installations/:installationId` | Company token               | Revoke installation                   |

### Venues, Spaces, and media

| Method | Path                                                    | Requirement     | Purpose                        |
| ------ | ------------------------------------------------------- | --------------- | ------------------------------ |
| GET    | `/api/space-catalog`                                    | Public          | Read controlled categories     |
| GET    | `/api/companies/venues`                                 | `spaces.view`   | List own Venues                |
| GET    | `/api/companies/venues/:id`                             | `spaces.view`   | Read own Venue                 |
| POST   | `/api/companies/venues`                                 | `spaces.manage` | Create Venue                   |
| PATCH  | `/api/companies/venues/:id`                             | `spaces.manage` | Update Venue                   |
| GET    | `/api/companies/spaces`                                 | `spaces.view`   | List own Spaces                |
| GET    | `/api/companies/spaces/:id`                             | `spaces.view`   | Read own Space                 |
| POST   | `/api/companies/spaces`                                 | `spaces.manage` | Create draft Space             |
| PATCH  | `/api/companies/spaces/:id`                             | `spaces.manage` | Update editable Space          |
| POST   | `/api/companies/spaces/:id/submissions`                 | `spaces.manage` | Submit Space for review        |
| DELETE | `/api/companies/spaces/:id`                             | `spaces.manage` | Archive Space                  |
| GET    | `/api/companies/spaces/:spaceId/media`                  | `spaces.view`   | List controlled media          |
| POST   | `/api/companies/spaces/:spaceId/media`                  | `spaces.manage` | Upload verified image          |
| PATCH  | `/api/companies/spaces/:spaceId/media/:mediaId`         | `spaces.manage` | Update alt text                |
| PUT    | `/api/companies/spaces/:spaceId/media/order`            | `spaces.manage` | Replace media order            |
| PUT    | `/api/companies/spaces/:spaceId/media/:mediaId/cover`   | `spaces.manage` | Select approved cover          |
| DELETE | `/api/companies/spaces/:spaceId/media/:mediaId`         | `spaces.manage` | Soft-delete media              |
| GET    | `/api/companies/spaces/:spaceId/media/:mediaId/content` | `spaces.view`   | Preview owned non-public media |

### Calendar and inventory

| Method | Path                                                         | Requirement       | Purpose                           |
| ------ | ------------------------------------------------------------ | ----------------- | --------------------------------- |
| GET    | `/api/companies/calendar`                                    | `calendar.view`   | Read bounded calendar feed        |
| GET    | `/api/companies/calendar/spaces/:id/policy`                  | `calendar.view`   | Read Space policy                 |
| PUT    | `/api/companies/calendar/spaces/:id/policy`                  | `calendar.manage` | Replace policy and weekly hours   |
| GET    | `/api/companies/calendar/spaces/:id/sessions`                | `calendar.view`   | List named sessions               |
| POST   | `/api/companies/calendar/spaces/:id/sessions`                | `calendar.manage` | Create named session              |
| PUT    | `/api/companies/calendar/spaces/:id/sessions/:sessionId`     | `calendar.manage` | Replace named session             |
| DELETE | `/api/companies/calendar/spaces/:id/sessions/:sessionId`     | `calendar.manage` | Delete named session              |
| GET    | `/api/companies/calendar/spaces/:id/exceptions`              | `calendar.view`   | List date exceptions              |
| POST   | `/api/companies/calendar/spaces/:id/exceptions`              | `calendar.manage` | Create date exception             |
| PUT    | `/api/companies/calendar/spaces/:id/exceptions/:exceptionId` | `calendar.manage` | Replace date exception            |
| DELETE | `/api/companies/calendar/spaces/:id/exceptions/:exceptionId` | `calendar.manage` | Delete date exception             |
| POST   | `/api/companies/calendar/external-reservations`              | `calendar.manage` | Create auditable inventory source |
| PATCH  | `/api/companies/calendar/external-reservations/:id`          | `calendar.manage` | Reschedule/update external source |
| DELETE | `/api/companies/calendar/external-reservations/:id`          | `calendar.manage` | Release external source and block |

### Requests and visits

| Method | Path                                              | Requirement               | Purpose                                |
| ------ | ------------------------------------------------- | ------------------------- | -------------------------------------- |
| GET    | `/api/companies/booking-requests`                 | `booking_requests.view`   | List unified Booking inbox             |
| GET    | `/api/companies/booking-requests/:id`             | `booking_requests.view`   | Read owned Booking request             |
| POST   | `/api/companies/booking-requests/:id/approve`     | `booking_requests.manage` | Approve and create payment hold        |
| POST   | `/api/companies/booking-requests/:id/reject`      | `booking_requests.manage` | Reject with reason                     |
| POST   | `/api/companies/booking-requests/:id/cancel`      | `bookings.manage`         | Provider cancellation                  |
| GET    | `/api/companies/date-inquiries`                   | `inquiries.view`          | List inquiries                         |
| GET    | `/api/companies/date-inquiries/:id`               | `inquiries.view`          | Read inquiry                           |
| GET    | `/api/companies/date-inquiries/:id/messages`      | `inquiries.view`          | Read durable messages                  |
| POST   | `/api/companies/date-inquiries/:id/answer`        | `inquiries.manage`        | Answer inquiry                         |
| POST   | `/api/companies/date-inquiries/:id/:action`       | `inquiries.manage`        | Start review, reject, or close         |
| GET    | `/api/companies/visit-requests`                   | `visits.view`             | List visit requests                    |
| GET    | `/api/companies/visit-requests/:id`               | `visits.view`             | Read visit request                     |
| POST   | `/api/companies/visit-requests/:id/:action`       | `visits.manage`           | Confirm/reject/cancel/complete/no-show |
| GET    | `/api/companies/spaces/:spaceId/request-settings` | `booking_requests.view`   | Read response-time overrides           |
| PUT    | `/api/companies/spaces/:spaceId/request-settings` | `booking_requests.manage` | Replace response-time overrides        |

### Pricing, quotes, and finance

| Methods    | Path                                                        | Requirement               | Purpose                          |
| ---------- | ----------------------------------------------------------- | ------------------------- | -------------------------------- |
| GET/POST   | `/api/companies/pricing/rate-plans`                         | pricing permission        | List/create rate plans           |
| PUT/DELETE | `/api/companies/pricing/rate-plans/:id`                     | `pricing.manage`          | Replace/archive rate plan        |
| GET/POST   | `/api/companies/pricing/service-options`                    | pricing permission        | List/create priced options       |
| PUT/DELETE | `/api/companies/pricing/service-options/:id`                | `pricing.manage`          | Replace/archive priced option    |
| POST       | `/api/companies/spaces/:spaceId/service-options`            | `pricing.manage`          | Attach priced option             |
| DELETE     | `/api/companies/spaces/:spaceId/service-options/:serviceId` | `pricing.manage`          | Detach priced option             |
| GET/POST   | `/api/companies/pricing/packages`                           | pricing permission        | List/create package              |
| PUT/DELETE | `/api/companies/pricing/packages/:id`                       | `pricing.manage`          | Replace/archive package          |
| GET/POST   | `/api/companies/quotes`                                     | quote permission          | List/create quotes               |
| GET/PUT    | `/api/companies/quotes/:id`                                 | quote permission          | Read/revise quote                |
| POST       | `/api/companies/quotes/:id/send`                            | `quotes.manage`           | Send current draft revision      |
| POST       | `/api/companies/quotes/:id/withdraw`                        | `quotes.manage`           | Withdraw quote                   |
| GET        | `/api/companies/payments`                                   | `finance.view`            | List Payments                    |
| GET        | `/api/companies/refunds`                                    | `finance.view`            | List Refunds                     |
| POST       | `/api/companies/refunds/:id/retry`                          | `refunds.approve`         | Retry failed Refund idempotently |
| GET/POST   | `/api/companies/cancellation-policies`                      | finance/refund permission | List/version policies            |
| POST       | `/api/companies/bookings/:bookingId/paid-cancellation`      | `refunds.request`         | Cancel paid Booking              |
| GET        | `/api/companies/reconciliation`                             | `finance.view`            | Read reconciliation evidence     |

For combined pricing and quote rows, `GET` requires the corresponding `.view` permission and mutations require the corresponding `.manage` permission. Cancellation-policy reads require `finance.view`, while creating a new policy version requires `refunds.approve`. Dynamic inquiry actions are `start-review`, `rejected`, and `closed`; visit actions are `confirm`, `reject`, `cancel`, `complete`, and `no-show` (past-tense aliases are also accepted by the controller).

## Controlled Space images

Space listings use `POST /api/companies/spaces/:spaceId/media` as multipart form data with exactly one `image` field and optional `altTextAr`/`altTextEn` fields (240 characters each). JPEG, PNG, and WebP are accepted up to 10 MB. The backend verifies bytes and dimensions; never send or persist a storage key, URL, provenance, ownership, or moderation field.

Use `GET .../media`, `PATCH .../media/:mediaId` (alt text only), `PUT .../media/order` with `{ "mediaIds": [...] }`, `PUT .../media/:mediaId/cover`, and `DELETE .../media/:mediaId`. Returned `contentUrl` is the only preview URL to use. Pending/rejected previews require the owning company token; only approved images can become cover. Rejected images must be deleted and replaced.

Stable errors include `SPACE_MEDIA_FILE_REQUIRED`, `SPACE_MEDIA_TYPE_INVALID`, `SPACE_MEDIA_TOO_LARGE` (413), `SPACE_MEDIA_IMAGE_INVALID`, `SPACE_MEDIA_LIMIT_REACHED`, `SPACE_MEDIA_NOT_FOUND`, `SPACE_MEDIA_FORBIDDEN`, and `SPACE_MEDIA_STATE_INVALID`.

Catalog mutations and all booking-management actions require approval. Notifications require a company account but not approval.

## Approval and session states

```ts
type CompanyStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

type CompanyRole =
  'owner' | 'manager' | 'booking_staff' | 'calendar_staff' | 'accountant' | 'viewer'

type CompanyPermission =
  | 'spaces.view'
  | 'spaces.manage'
  | 'calendar.view'
  | 'calendar.manage'
  | 'booking_requests.view'
  | 'booking_requests.manage'
  | 'inquiries.view'
  | 'inquiries.manage'
  | 'bookings.view'
  | 'bookings.manage'
  | 'quotes.view'
  | 'quotes.manage'
  | 'pricing.view'
  | 'pricing.manage'
  | 'visits.view'
  | 'visits.manage'
  | 'finance.view'
  | 'refunds.request'
  | 'refunds.approve'
  | 'members.view'
  | 'members.manage'
  | 'company.view'
  | 'company.manage'
  | 'payout_settings.manage'

type CompanySessionMembership = {
  id: number
  companyId: number
  role: CompanyRole
  status: 'active'
  permissions: CompanyPermission[]
}
```

| Status      | Login                     | `/me` and notifications                         | Catalog mutations and bookings |
| ----------- | ------------------------- | ----------------------------------------------- | ------------------------------ |
| `pending`   | Allowed                   | Allowed                                         | `403 COMPANY_PENDING_APPROVAL` |
| `approved`  | Allowed                   | Allowed                                         | Allowed                        |
| `rejected`  | Allowed                   | Allowed                                         | `403 COMPANY_REJECTED`         |
| `suspended` | `401 INVALID_CREDENTIALS` | Existing tokens are revoked when admin suspends | Blocked                        |

Always use `company.status`, not the login message, as the state source of truth. Refresh `/api/companies/me` when the app resumes and after the user receives an approval/rejection notification.

Approval middleware errors use the standard error envelope, for example:

```json
{
  "error": {
    "code": "COMPANY_PENDING_APPROVAL",
    "message": "Your company is pending admin approval. You cannot perform this action yet."
  }
}
```

## Data types

Company login and `/me` use the same explicit public Company transformer. Legal documents, registration identifiers, ownership keys, moderation internals, and persistence columns are never returned to a company-app client.

```ts
type CompanyAuthRecord = {
  id: number
  city: string
  createdAt: string
  updatedAt: string | null
  status: CompanyStatus
  companyProfile: {
    id: number
    companyName: string
    description: string | null
    logo: string | null
    banner: string | null
    website: string | null
    socialLinks: Record<string, unknown> | string | null
  } | null
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
  paymentStatus: 'unpaid' | 'deposit_paid' | 'paid' | 'partially_refunded' | 'refunded'
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
}

Booking money: `totalPriceDecimal` is always the exact major-unit string when a total exists. Quote-backed Bookings also return the immutable `totalPriceMinor`. Numeric `totalPrice` becomes `null` rather than rounded when it is outside JavaScript's safe range.

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

Relations are conditional. Booking responses use immutable Space, Venue, and category snapshots so historical labels remain stable even when the catalog changes.

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

Success `200` returns `{ message, data: { user, company, membership, token } }`, where `company` is the expanded `CompanyAuthRecord` and `membership` contains `id`, `companyId`, `role`, `status`, and resolved `permissions`. Pending and rejected companies can log in; suspended, deleted, wrong-type, and bad-credential accounts receive `401 INVALID_CREDENTIALS`.

Possible successful messages are `Login successful`, the pending variant, and the rejected variant. There is no successful suspended variant in the current controller.

### Restore session

`GET /api/companies/me` returns:

```json
{
  "data": {
    "user": { "id": 2, "email": "company@example.com", "userType": "company" },
    "company": {},
    "membership": {
      "id": 7,
      "companyId": 1,
      "role": "manager",
      "status": "active",
      "permissions": ["members.view", "spaces.view"]
    }
  }
}
```

The actual `company` is the expanded auth record including `companyProfile`. `membership.permissions` is recalculated from the current role and permission overrides on every request. Use this endpoint to restore company state and authoritative permissions after reading the stored token; do not rely on a cached login membership after app restart or resume.

### Logout

`POST /api/companies/logout` revokes only the current token and returns `{ "message": "Logged out successfully" }`.

## Notifications

### Booking-request recipients

Space booking requests create one company-scoped notification intent for every active membership with effective `booking_requests.view`. Role presets and both `allow` and `deny` overrides are applied; a revoked or suspended membership is excluded. The app must not assume that only the owner receives `new_booking_request`, and it must not perform its own role-based recipient calculation.

This changes delivery only. The booking request routes, response envelopes, and booking state machine are unchanged.

### List

`GET /api/companies/notifications?page=1&limit=20&unread_only=true`

Returns `{ data: Notification[], meta }`, newest first. Current Company flows include account state, new Booking/inquiry/visit work, quote outcomes, and finance/reconciliation events. Examples include `company_approved`, `company_rejected`, `new_booking_request`, `date_inquiry_received`, `visit_requested`, `quote_accepted`, `payment_succeeded`, `refund_failed`, and `reconciliation_required`. Render unknown types generically.

Every company notification is scoped to the User's current Company and the Company selected by the access token. List, unread count, mark-one-read, and mark-all-read never cross that boundary. Company notifications are also excluded from the same person's customer-app inbox.

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

The installation represents the person and physical company-app installation. Suspending the current
Company or suspending/revoking the membership revokes that company-app installation. Customer-app
installations remain active. Push fan-out also checks the notification's Company and an active
membership at delivery time.

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
- Hide Venue/Space mutations and booking management until the Company is approved.
- Treat nested booking relations as optional and refresh details after accept/reject when a complete object is required.
- Do not expose company-profile editing or registration-PDF download until backend endpoints are added. Use the documented pricing, finance, and controlled-media endpoints for those supported workflows.

## Request workflows

- Use `GET /api/companies/booking-requests` as the provider inbox for request-to-book Spaces. `pending` means awaiting provider; `accepted` means approved and awaiting payment. Requests carry a server-owned immutable rate-plan/VAT snapshot created at submission; approval does not trust a client total and later catalog edits do not rewrite the Booking. Approval can return `409 INVENTORY_OVERLAP`, `AVAILABILITY_SCHEDULE_CONFLICT`, or `SPACE_NOT_APPROVABLE`; refresh the item and calendar instead of retrying blindly.
- Date inquiries use `/api/companies/date-inquiries`. They never reserve inventory. Members need `inquiries.view` to read and `inquiries.manage` to answer.
- Visit requests use `/api/companies/visit-requests`. They never create rentable-space blocks. Confirmation can return `409 VISIT_TIME_CONFLICT` when the Venue already has a confirmed visit.
- Confirming the customer's exact visit interval sets `confirmed`. Supplying a different interval creates `alternative_proposed`; it is not confirmed until the customer explicitly accepts it. Refresh after `REQUEST_VERSION_CONFLICT`.
- Confirmation and proposed alternatives must start in the future and end after they start. Invalid or elapsed intervals return `422 REQUEST_TIME_INVALID`.
- Company request notifications fan out only to active members with the effective view permission after role presets and allow/deny overrides. Direct customer email snapshots are redacted from every inquiry and visit list, detail, and mutation response.
- Configure response deadlines with `GET|PUT /api/companies/spaces/:spaceId/request-settings`. Null overrides inherit category defaults.
- Present Arabic labels first with deterministic English fallback. Suggested labels: `pending` = `بانتظار رد المزود`, `accepted` = `مقبول - بانتظار الدفع`, inquiry `open` = `مفتوح`, visit `submitted` = `بانتظار التأكيد`.

## Pricing and quotes

Company pricing uses integer SAR minor units represented as decimal strings in request and response JSON. Never parse monetary fields through JavaScript `Number`; use string/BigInt-safe client handling. Manage rate plans under `/api/companies/pricing/rate-plans`, priced options under `/pricing/service-options`, Space attachments under `/spaces/:spaceId/service-options`, and packages under `/pricing/packages`. Reads require `pricing.view`; mutations require `pricing.manage`.

Create quotes from eligible date inquiries with `POST /api/companies/quotes`. Quote mutations require `quotes.manage`; inbox/history reads require `quotes.view`. Sending freezes a revision. Editing commercial content after send creates a new draft revision that must be sent explicitly. Statuses are `draft`, `sent`, `accepted`, `customer_declined`, `expired`, and `withdrawn`. Quote acceptance creates an awaiting-payment inventory hold, not payment or confirmation.

Every quote revision uses one VAT-inclusion display policy across all lines. Mixed source policies return `422 QUOTE_TAX_POLICY_MIXED`.

## Company finance

Members with effective `finance.view` may read `/api/companies/payments`, `/api/companies/refunds`, and `/api/companies/reconciliation`. `refunds.approve` manages cancellation-policy versions; `refunds.request` may call `/api/companies/bookings/:bookingId/paid-cancellation`. Active membership, tenant scope, role presets, and allow/deny overrides apply.

Retry a failed Refund with `POST /api/companies/refunds/:id/retry` and `{ idempotencyKey }`. This requires effective `refunds.approve`; revoked memberships and deny overrides are rejected. Each retry adds a historical RefundAttempt to the same Refund. Same-key reuse returns the same attempt, conflicting reuse returns `PAYMENT_IDEMPOTENCY_CONFLICT`, and succeeded Refunds cannot be retried.

Amounts are canonical minor-unit strings. `deposit` is distinct from `full_payment`, and remaining balance must stay visible. Do not build manual mark-paid/refunded controls: verified provider events own financial completion and Booking confirmation. Reconciliation is read-only evidence.

Provider cancellation is explicitly full-refundable in this MVP. Customer refunds use the policy snapshot captured before payment. Historical Bookings do not change after policy edits. Receipt snapshots are not ZATCA tax invoices.

Finance notifications fan out only to active members with effective `finance.view`, including deny overrides. Payment/refund failure and reconciliation events are durable operational notifications. Never expose raw webhook bodies, signatures, provider secrets, customer contact snapshots, or mutable receipt controls.

## Backend-only admin completion

The backend now exposes admin-only catalog, audit, refund-retry, and payment-dispute operations under `/api/admin`. These routes require an admin token and must not be called or displayed by the company app. Their only company-app effects are:

- `GET /api/space-catalog` may reflect administrator label, ordering, searchable-amenity, and active-state changes after refresh.
- Deactivated categories or amenities stop appearing in the public catalog; existing historical Space relations are not deleted.
- A support dispute does not change a Booking, Payment, or Refund state. Continue polling the documented finance endpoints for authoritative financial state.
- Refund provider retries remain asynchronous. Company members may still use the documented company refund-retry endpoint when they hold effective `refunds.approve`.

## Canonical company API contract

This section is normative for the company mobile agent. Protected calls require a company-app bearer token containing exactly `client:company_app` and one `company:<id>` ability. Tenant identity is never accepted from a body or query parameter. Unless stated otherwise, success is `{ "data": ... }`, a list is `{ "data": [...], "meta": PaginationMeta }`, and `204` has no body. Transformer-backed Venue/Space/member objects use camelCase; calendar, inquiry, visit, pricing, quote, refund-list, and request-settings rows currently expose database snake_case and must be modeled that way.

### Permission matrix

| Surface               | Read permission         | Mutation permission                                                           |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| Members/invitations   | `members.view`          | `members.manage`                                                              |
| Venues, Spaces, media | `spaces.view`           | `spaces.manage`                                                               |
| Calendar              | `calendar.view`         | `calendar.manage`                                                             |
| Booking requests      | `booking_requests.view` | approve/reject: `booking_requests.manage`; provider cancel: `bookings.manage` |
| Inquiries             | `inquiries.view`        | `inquiries.manage`                                                            |
| Visits                | `visits.view`           | `visits.manage`                                                               |
| Request settings      | `booking_requests.view` | `booking_requests.manage`                                                     |
| Pricing               | `pricing.view`          | `pricing.manage`                                                              |
| Quotes                | `quotes.view`           | `quotes.manage`                                                               |
| Finance               | `finance.view`          | cancellation: `refunds.request`; policy/retry: `refunds.approve`              |

All catalog, calendar, request-management, pricing, quote, and finance routes also require an approved Company. Role defaults are exact:

- `owner`: every permission.
- `manager`: every permission except `payout_settings.manage`.
- `booking_staff`: `spaces.view`, `calendar.view`, both booking-request, inquiry, booking, quote, pricing, and visit permissions.
- `calendar_staff`: `spaces.view`, both calendar permissions, `booking_requests.view`, `inquiries.view`, `bookings.view`, and both visit permissions.
- `accountant`: `spaces.view`, `bookings.view`, `quotes.view`, `pricing.view`, `finance.view`, `refunds.request`.
- `viewer`: `spaces.view`, `calendar.view`, `booking_requests.view`, `inquiries.view`, `bookings.view`, `quotes.view`, `pricing.view`, `visits.view`, `company.view`.

Apply `allow` overrides first and `deny` overrides last. `membership.permissions` from login and `/me` is authoritative.

### Auth and registration schema

```ts
type CompanyRegistrationForm = {
  email: string
  password: string // >=8
  companyName: string
  registrationNumber: string
  registrationNumberPdf: File // PDF, <=10 MB
  businessAddress: string
  city: string
  taxId?: string
  businessLicense?: string
  contactPerson?: string
  description?: string
  logo?: string // text, not file
  banner?: string // text, not file
  website?: string
  socialLinks?: unknown // multipart text is not JSON-decoded
}
```

Registration validates and scans the PDF, then atomically creates the User, pending Company, owner membership, and profile. It returns the compact registration response already shown. `POST /api/companies/login` accepts `{ email, password }` and returns `{ message, data: { user, company, membership, token } }`; `GET /api/companies/me` returns the same user/company/membership contract without token; logout revokes only the current token.

### Members and invitations

```ts
type PermissionOverride = { permission: CompanyPermission; effect: 'allow' | 'deny' }
type CompanyMember = {
  id: number
  companyId: number
  user?: { id: number; name: string | null; email: string; phone: string | null }
  role: CompanyRole
  status: 'active' | 'suspended'
  permissions: CompanyPermission[]
  permissionOverrides: PermissionOverride[]
  joinedAt: string | null
  createdAt: string
  updatedAt: string | null
}
type CompanyInvitation = {
  id: number
  name: string
  invitedEmail: string
  invitedPhone: null
  role: CompanyRole
  permissionOverrides: PermissionOverride[] | null
  status: 'pending' | 'accepted' | 'cancelled'
  expiresAt: string
  acceptedAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string | null
}
```

| Endpoint                                         | Input                                                         | Success                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/companies/members`                     | none                                                          | `{ data: CompanyMember[] }`; revoked excluded                           |
| `PATCH /api/companies/members/:id`               | optional `role`, `status: active                              | suspended                                                               | revoked`, `permissionOverrides` | `{ message, data: CompanyMember }` |
| `DELETE /api/companies/members/:id`              | none                                                          | `204`; revokes member and company-app access                            |
| `GET /api/companies/invitations`                 | none                                                          | `{ data: CompanyInvitation[] }`                                         |
| `POST /api/companies/invitations`                | `{ name: string(2..120), email, role, permissionOverrides? }` | `201 { message, data: CompanyInvitation }`                              |
| `POST /api/companies/invitations/:id/resend`     | none                                                          | `{ message, data: CompanyInvitation }`; rotates token, seven-day expiry |
| `DELETE /api/companies/invitations/:id`          | none                                                          | `204`                                                                   |
| `GET /api/company-invitations/inspect?token=...` | token 32..200 chars                                           | `{ data: InvitationInspection }`                                        |
| `POST /api/company-invitations/accept`           | `{ token, name?, password? }`                                 | `201 { message, data: { membership, token } }`                          |

```ts
type InvitationInspection = {
  id: number
  name: string
  role: CompanyRole
  expiresAt: string
  invitedEmail: string | null
  invitedPhone: string | null // masked
  company: { id: number; name: string | null; city: string }
}
```

An existing invited identity must authenticate normally; acceptance cannot change its password. A new identity supplies an 8–128 character password and optional 2–120 character name. The server always uses the invitation email. Important errors: `LAST_ACTIVE_OWNER`, `OWNER_MANAGEMENT_REQUIRES_OWNER`, `PAYOUT_PERMISSION_REQUIRES_OWNER`, `PERMISSION_DELEGATION_EXCEEDED`, `COMPANY_MEMBERSHIP_LIMIT_REACHED`, `MEMBERSHIP_ALREADY_EXISTS`, `INVITATION_ALREADY_PENDING`, `INVITATION_NOT_FOUND`, `INVITATION_NOT_PENDING`, `INVITATION_EXPIRED` (410), `INVITATION_IDENTITY_MISMATCH`, `INVITATION_AUTHENTICATION_REQUIRED`, `INVITATION_ACCOUNT_DETAILS_REQUIRED`, and `COMPANY_NOT_ACTIVE`.

### Venue contract

```ts
type LocalizedText = { ar?: string; en?: string } // at least one for names
type VenueWrite = {
  name: LocalizedText
  city: string
  district?: string
  street?: string
  buildingNumber?: string
  postalCode?: string
  additionalNumber?: string
  accessInstructions?: LocalizedText
  parkingNotes?: LocalizedText
  latitude?: number
  longitude?: number
  timezone?: string
}
type Venue = {
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
```

Names are 2–5,000 characters per localized value; city is 2–120; district 120; street 180; building/additional number 40; postal code 20; timezone 100 and must be valid IANA. Coordinates are bounded. `POST` returns `201`, `PATCH` returns `200`, list paginates, detail returns one Venue. Timezone cannot change while future calendar records exist (`VENUE_TIMEZONE_MIGRATION_REQUIRED`).

### Space contract

```ts
type SpaceWrite = {
  venueId: number
  category:
    | 'wedding_hall'
    | 'private_event_venue'
    | 'meeting_room'
    | 'training_room'
    | 'workshop_room'
    | 'seminar_space'
    | 'conference_space'
    | 'graduation_venue'
    | 'exhibition_space'
    | 'multipurpose_space'
  name: LocalizedText
  description?: LocalizedText
  bookingMode: 'request_to_book' | 'quote_required'
  capacityTotal: number
  requiresVisit?: boolean
  minimumDurationMinutes?: number
  maximumDurationMinutes?: number
  minimumNoticeHours?: number
  amenityIds?: number[]
  eventDetails?: {
    maleCapacity?: number
    femaleCapacity?: number
    hasSeparateEntrances?: boolean
    hasBridalRoom?: boolean
    hasStage?: boolean
  }
  layoutCapacities?: Array<{
    layout: 'boardroom' | 'classroom' | 'theater' | 'u_shape' | 'banquet' | 'standing' | 'cabaret'
    capacity: number
  }>
  largeFormatDetails?: {
    floorAreaSqm?: number
    ceilingHeightM?: number
    hasLoadingAccess?: boolean
    visitorCapacity?: number
    powerRequirement?: string
  }
}
```

Create requires the base fields; update accepts a partial object. Responses use the full `Space` schema in the user guide, with any company-visible publication status. Category-specific detail objects are rejected on incompatible categories. `POST /:id/submissions` returns `{ data: { id, publicationStatus: 'pending_review' } }`; `DELETE` archives and returns `204`. Handle `AMENITY_INVALID`, `SPACE_TRANSITION_INVALID_STATE`, `LOCALIZED_VALUE_REQUIRED`, and category-detail validation errors.

### Controlled media

```ts
type SpaceMedia = {
  id: number
  spaceId: number
  type: 'image'
  moderationStatus: 'pending' | 'approved' | 'rejected'
  altTextAr: string | null
  altTextEn: string | null
  sortOrder: number
  isCover: boolean
  contentUrl: string
  createdAt: string
  updatedAt: string | null
}
```

Upload is multipart: exactly one JPEG/PNG/WebP `image` <=10 MB plus optional nullable alt text (max 240); success `201`. List returns all owned moderation states. Alt update accepts only `{ altTextAr?, altTextEn? }`. Reorder requires `{ mediaIds: number[] }` length 1–20 and returns the array. Cover has no body and requires approved media. Deletes return `204`. Company content is binary with `private, no-store` caching.

### Calendar schemas and responses

```ts
type AvailabilityPolicyWrite = {
  mode: 'hourly' | 'session' | 'full_day' | 'multi_day'
  slotIncrementMinutes: number
  minimumDurationMinutes: number
  maximumDurationMinutes: number
  minimumNoticeMinutes: number
  maximumAdvanceDays: number
  preparationBufferMinutes: number
  cleanupBufferMinutes: number
  operatingHours: Array<{
    weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6
    opensAtLocal: string
    closesAtLocal: string
    endsNextDay?: boolean
  }>
}
type SessionWrite = {
  code: string
  name: LocalizedText
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6
  startsAtLocal: string
  endsAtLocal: string
  endsNextDay?: boolean
  isActive?: boolean
}
type ExceptionWrite = {
  localDate: string
  kind: 'closed' | 'modified_hours' | 'open_override'
  startsAtLocal?: string
  endsAtLocal?: string
  endsNextDay?: boolean
  reason?: string
}
type ExternalReservationWrite = {
  spaceId: number
  type: 'external_confirmed' | 'external_hold' | 'maintenance' | 'closure' | 'internal_event'
  startsAt: string
  endsAt: string
  timezone: string
  expiresAt?: string
  preparationBufferMinutes?: number
  cleanupBufferMinutes?: number
  internalNote?: string
}
```

Times in policy/session/exception are `HH:mm`; external instants require explicit offset. Policy constraints: slot <=1,440; min duration <=10,080; max <=44,640 and >= min; notice <=525,600; advance <=730 days; buffers <=10,080; max 28 non-overlapping hours. A `closed` exception forbids times; other kinds require both. An `external_hold` requires future `expiresAt`, and timezone must equal the Venue timezone.

Calendar responses are raw snake_case rows. `GET /calendar?from&to&page&limit` returns paginated external reservations, max 93-day range/100 rows. Policy GET returns `{ policy, operatingHours }`; PUT atomically replaces both. Session/exception lists return arrays; creates are `201`; replacements `200`; deletes `204`. External create is `201`, patch is `200` and cannot change Space, delete returns the released row with `status='cancelled'`. Handle `DURATION_RANGE_INVALID`, window-overlap errors, `SESSION_NOT_FOUND`, `EXCEPTION_FIELDS_INVALID`, `EXCEPTION_FIELDS_REQUIRED`, `EXCEPTION_CONFLICT`, `EXCEPTION_NOT_FOUND`, `CALENDAR_INSTANT_AMBIGUOUS`, `CALENDAR_INSTANT_INVALID`, `CALENDAR_RANGE_INVALID`, `CALENDAR_RANGE_LIMIT`, `CALENDAR_TIMEZONE_MISMATCH`, `EXTERNAL_HOLD_EXPIRY_REQUIRED`, `EXTERNAL_HOLD_EXPIRY_INVALID`, `EXTERNAL_SPACE_IMMUTABLE`, and `INVENTORY_OVERLAP`.

### Request inbox schemas

Booking lists/details use the camelCase `Booking` schema in the user guide. List accepts `page`, `limit`, and optional known `status`. Approve has no body. Reject/cancel body is `{ reason: string(3..1000), lockVersion?: number }`; `lockVersion` is validated but Booking actions currently do not consume it.

Inquiry and visit rows use the user guide's snake_case schemas, but company responses remove `customer_email_snapshot`. Message history is ascending `{ id, sender_type, body, created_at }`.

```ts
type InquiryAnswer = { message: string; lockVersion?: number } // message 1..2000
type InquiryTransition = { reason: string; lockVersion?: number } // reason 3..1000
type VisitAction = {
  reason?: string
  providerNotes?: string
  startsAt?: string
  endsAt?: string
  lockVersion?: number
}
```

Inquiry action values: `start-review` (maps to `under_review`), `rejected`, `closed`. Answer is allowed from `open|under_review`. Provider transitions: `open -> under_review|rejected`, `under_review -> rejected`, `answered -> closed`. Visit actions accept `confirm|confirmed`, `reject|rejected`, `cancel|cancelled`, `complete|completed`, `no-show`. A changed confirm interval produces `alternative_proposed`; both future instants must be present.

Request settings body fields are nullable `bookingResponseHours`, `inquiryResponseHours`, `visitResponseHours` (1–720), and `quoteHoldHours` (1–72). GET may return `data:null`. PUT upserts. The response is raw `id`, `company_id`, `space_id`, `booking_response_hours`, `inquiry_response_hours`, `visit_response_hours`, `quote_hold_hours`, and timestamps.

### Pricing contract

Money fields are non-negative decimal strings up to 19 digits.

```ts
type RatePlanWrite = {
  spaceId: number
  nameAr?: string
  nameEn?: string
  pricingMode: 'hourly' | 'fixed_session' | 'half_day' | 'full_day' | 'package' | 'custom_quote'
  priceMinor?: string | null
  pricesIncludeVat: boolean
  vatRateBps: number
  minimumDurationMinutes?: number
  maximumDurationMinutes?: number
  fixedDurationMinutes?: number
  sessionCode?: string
  isActive?: boolean
}
type ServiceOptionWrite = {
  nameAr?: string
  nameEn?: string
  descriptionAr?: string
  descriptionEn?: string
  priceMinor: string
  pricesIncludeVat: boolean
  vatRateBps: number
  isActive?: boolean
}
type PackageWrite = {
  spaceId: number
  nameAr?: string
  nameEn?: string
  descriptionAr?: string
  descriptionEn?: string
  basePriceMinor: string
  pricesIncludeVat: boolean
  vatRateBps: number
  isActive?: boolean
  items: Array<{
    serviceOptionId?: number
    itemType:
      | 'hall_rental'
      | 'hospitality'
      | 'seating'
      | 'bridal_room'
      | 'stage'
      | 'equipment'
      | 'staffing'
      | 'setup'
      | 'teardown'
      | 'service'
    descriptionAr?: string
    descriptionEn?: string
    quantity: number
    isIncluded: boolean
  }>
}
```

At least one localized name is required. Custom quote omits/nulls price; all other modes require it. Duration fields are hourly-only; session fields fixed-session-only; hourly pricing requires hourly availability. Responses are raw snake_case rows. List endpoints paginate and omit archived records. Create `201`, update `200`, archive `204`. Attach body is `{ serviceOptionId, isActive? }`; detach `204`. Package create/update includes `items`; package list does not preload them. Handle `LOCALIZATION_REQUIRED`, `RATE_PLAN_MODE_INVALID`, `RATE_PLAN_AVAILABILITY_MISMATCH`, `HISTORICAL_PRICE_IMMUTABLE`, and `QUOTE_AMOUNT_INVALID`.

### Quote contract

```ts
type QuoteItemWrite = {
  sourceType: 'rate_plan' | 'package' | 'service' | 'adjustment'
  sourceId?: number
  descriptionAr?: string
  descriptionEn?: string
  quantity: number
  unitPriceMinor?: string
  discountMinor?: string
}
type CreateQuote = {
  inquiryId: number
  visitRequestId?: number
  internalNotes?: string
  pricesIncludeVat: boolean
  vatRateBps: number
  depositPercent?: number
  items: QuoteItemWrite[]
}
type UpdateQuote = Omit<CreateQuote, 'inquiryId' | 'visitRequestId'>
```

Items length is 1–100, notes max 4,000, VAT bps 0–10,000, deposit 0–100 integer. Source items use authoritative active prices. Adjustments require description, explicit `unitPriceMinor`, and no `sourceId`. The server calculates every total.

Company responses are raw snake_case Quote rows with `revisions` and `line_items` on detail/mutations; list is summary only. Internal responses include `internal_notes`, `lock_version`, draft revisions, and source foreign keys. Create is `201`; update replaces/creates a draft; send body is `{ expiresInHours: integer(1..720) }`; withdraw accepts `{ revisionId?: number, reason?: string(3..1000) }` (revisionId is currently not consumed). Handle `QUOTE_INVALID_TRANSITION`, `QUOTE_DRAFT_REQUIRED`, `QUOTE_TAX_POLICY_MIXED`, `QUOTE_ITEM_INVALID`, and `QUOTE_AMOUNT_INVALID`.

### Finance contract

Company Payments use the user guide's `Payment` schema with `attempt:null` in lists. Refund list rows are snake_case:

```ts
type CompanyRefundRow = {
  id: string | number
  reference: string
  payment_id: string | number
  booking_id: number
  requested_amount_minor: string
  approved_amount_minor: string
  currency: 'SAR'
  reason: string
  status: string
  created_at: string
  processed_at: string | null
}
type CancellationPolicyWrite = {
  name: string
  depositNonRefundable?: boolean
  tiers: Array<{ minimumHours: number; refundPercent: number }>
}
```

Policy name is 2–160; tiers length 1–10, hours 0–8,760, percent 0–100, unique hours. POST creates a version, deactivates the old one, and returns a raw snake_case policy row. Refund retry body is `{ idempotencyKey: string(8..180) }` and returns canonical `Refund`. Paid cancellation body is `{ reason: string(3..1000), idempotencyKey: string(8..180) }`; company cancellation is 100% refundable and returns `{ status:'not_required', amountMinor:'0' }` or `{ reference, status:'requested', amountMinor }`.

Reconciliation accepts optional `result`: `matched`, `amount_mismatch`, `currency_mismatch`, `unknown_provider_reference`, `late_success`, `refund_mismatch`, or `unresolved`; unknown values are ignored. It returns up to 100 raw rows. Handle `CANCELLATION_NOT_ALLOWED`, `CANCELLATION_POLICY_REQUIRED`, `REFUND_NOT_ALLOWED`, `REFUND_NOT_FOUND`, `REFUND_FINALIZED`, `REFUND_ATTEMPT_ACTIVE`, and `PAYMENT_IDEMPOTENCY_CONFLICT`.

### Notifications and push

Notification and push schemas match the user guide. Company notifications are scoped by both User and token Company; `unread_only` is snake_case. Push registration is permitted for pending/rejected Companies but not suspended/deleted Companies or inactive memberships. Store is idempotent `200`; delete is idempotent `204`.

## Company state machines

```text
Company: pending -> approved | rejected; approved -> suspended -> approved
Membership: active <-> suspended -> revoked
Invitation: pending -> accepted | cancelled | expired-by-time
Space: draft -> pending_review -> published
       pending_review -> changes_requested -> pending_review
       published edit -> pending_review; published -> suspended
       draft/changes_requested -> archived
Booking: pending -> accepted -> confirmed -> completed
         pending -> rejected|expired; pending/accepted -> cancelled; accepted -> payment_expired
Inquiry: open -> under_review -> answered -> closed
         open/under_review -> rejected; open/under_review -> expired
Visit: submitted -> confirmed -> completed|no_show|cancelled
       submitted -> alternative_proposed -> confirmed|cancelled
       submitted -> rejected|cancelled|expired
Quote: draft -> sent -> accepted|customer_declined|withdrawn|expired
External reservation: active -> cancelled|expired
Payment/refund completion: trusted provider webhooks only
```

## Complete company error contract

Validation and domain errors use `{ "error": { "code": string, "message": string, "details"?: [] } }`. `details` appears on `422 VALIDATION_ERROR`. Missing/invalid auth is `401 UNAUTHORIZED`; bad login is `401 INVALID_CREDENTIALS`; deleted account is `401 ACCOUNT_INACTIVE`; tenant/permission/approval failures are `403`; state/inventory/optimistic conflicts are normally `409`; expired invitations use `410`; bad input `422`; oversized upload `413`; scanner outage `503`; throttling `429` with `Retry-After`. Core company codes are `COMPANY_TOKEN_REQUIRED`, `COMPANY_SCOPE_REQUIRED`, `COMPANY_MEMBERSHIP_REQUIRED`, `COMPANY_PERMISSION_REQUIRED`, `COMPANY_PENDING_APPROVAL`, `COMPANY_REJECTED`, and `COMPANY_SUSPENDED`. Preserve unknown codes and render their safe message.
