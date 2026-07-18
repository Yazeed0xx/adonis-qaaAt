# QaaAt Mobile API Documentation

These are the canonical integration guides for the two mobile clients backed by this repository:

- [User app](./user-app.md)
- [Company app](./company-app.md)
- [Seeded mobile acceptance scenarios](./SEEDED_TEST_SCENARIOS.md)

They were verified against the routes, controllers, validators, middleware, transformers, services, migrations, configuration, and Japa contracts on **2026-07-18**. The similarly named files directly under `docs/` are legacy references and may contain obsolete routes or response shapes.

## Backend at a glance

QaaAt is an AdonisJS API written in TypeScript and backed by PostgreSQL. One `users` table supports three account types: `user`, `company`, and `admin`. The mobile apps use bearer access tokens. Tokens expire after 30 days.

Local base URL:

```text
http://localhost:3333
```

Runtime API references:

- Scalar UI: `GET /docs`
- OpenAPI JSON: `GET /openapi.json`
- Health check: `GET /health`

The Outloud OpenAPI 3.1 document is generated from routes, validators, controller return types, and transformers. Use the two handoff guides for mobile workflow context and the generated document for the machine-readable contract.

Backend/admin implementers should also read [Minimum admin operations](../product/ADMIN_OPERATIONS_HANDOFF_EN.md). Mobile agents need only its explicit mobile boundary; admin routes are not mobile surfaces.

## Authentication

Protected requests require:

```http
Authorization: Bearer <token>
Accept: application/json
```

JSON requests should also send `Content-Type: application/json`. Do not set `Content-Type` manually for multipart company registration; the HTTP client must add the boundary.

## Success response patterns

The API uses four common shapes:

```json
{ "data": {} }
```

```json
{ "data": [], "meta": {} }
```

```json
{ "message": "Operation completed", "data": {} }
```

```json
{ "message": "Operation completed" }
```

Transformer-backed resources are wrapped automatically. Relations such as `company`, `user`, and `services` are only present when that endpoint preloads them. Clients must treat nested relations as optional rather than assuming every endpoint returns the same expanded resource.

## Pagination

List endpoints accept `page` and `limit`. Invalid values fall back or clamp to safe values; `page` is at least 1 and `limit` is between 1 and 100. The default limit is 20.

```ts
type PaginationMeta = {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
  firstPage: number
  firstPageUrl: string | null
  lastPageUrl: string | null
  nextPageUrl: string | null
  previousPageUrl: string | null
}
```

## Errors: two shapes currently exist

Validation and application-domain errors use the standard envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": []
  }
}
```

Some route middleware returns a flat body instead:

```json
{
  "message": "Please verify your email address before proceeding.",
  "code": "EMAIL_NOT_VERIFIED"
}
```

Some account-type failures contain only `message`. A robust client should normalize both forms:

```ts
type NormalizedApiError = {
  status: number
  code?: string
  message: string
  details?: unknown
}

function normalizeApiError(status: number, body: any): NormalizedApiError {
  if (body?.error) {
    return {
      status,
      code: body.error.code,
      message: body.error.message ?? 'Request failed',
      details: body.error.details,
    }
  }

  return {
    status,
    code: body?.code,
    message: body?.message ?? 'Request failed',
  }
}
```

Always branch on the HTTP status first. In particular, handle `401` by clearing the session, `403` as a workflow/permission state, `422` as bad input, and `429` as a retry-later state.

## Shared serialization rules

- Response keys are camelCase.
- A few query keys are snake_case: `min_capacity`, `max_price`, and `unread_only`.
- Booking `totalPrice` is numeric only inside JavaScript's safe range; exact `totalPriceDecimal` and quote-backed `totalPriceMinor` are decimal strings.
- Date-time values are ISO 8601 strings.
- `bookingDate` is a date string (`YYYY-MM-DD`); booking times are strings (`HH:mm`).
- Nullable fields may be `null`; unloaded relations are normally omitted.

## Rate limits

| Operation                                   |                                  Limit | Block duration |
| ------------------------------------------- | -------------------------------------: | -------------: |
| Login, registration, and email verification |     5 requests/minute per IP and route |     10 minutes |
| Resend verification                         | 3 requests/10 minutes per IP and email |     30 minutes |
| Create booking                              |        10 requests/10 minutes per user |     15 minutes |

Production should use the database limiter store so limits are shared across API instances.

## Local backend setup

Requirements: Node.js, PostgreSQL, and `clamdscan` (or the executable configured by `MALWARE_SCANNER_COMMAND`) for company PDF registration.

```bash
npm install
cp .env.example .env
node ace migration:run
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
```

The required environment contract is defined in `start/env.ts`. Important app-facing variables include `APP_URL`, database credentials, Resend mail settings, `QUEUE_DRIVER`, `LIMITER_STORE`, `MALWARE_SCANNER_COMMAND`, and `DRIVE_DISK=fs`.

## Deliberate mobile boundaries

These are backend limitations, not undocumented mobile endpoints:

- There is no password reset or password change endpoint.
- There is no user-profile or company-profile update endpoint.
- Company invitations are verified-email-only. Phone remains optional profile data until an SMS/OTP provider and phone-authentication contract are approved.
- Payment disputes are admin-operated; neither mobile app has a dispute API.
- Admin catalog, audit-log, refund-retry, and dispute routes require admin tokens and are not mobile integration surfaces.
- Space images use the controlled upload and moderation APIs documented in the app guides.

Frontend teams should not invent calls for these capabilities. Add the backend routes first or hide the corresponding UI.

Sprint 6 uses trusted-webhook payment confirmation. Both apps must use exact monetary strings and must never interpret checkout redirects or local UI completion as payment success. See the app-specific Sprint 6 sections.
