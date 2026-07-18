# Japa Phase 5 Contract Matrix

## Authority and scope

This matrix maps the approved request-to-book, date-inquiry, visit, response-expiry, notification,
and audit contracts from `BACKEND_MVP_IMPLEMENTATION_HANDOFF_EN.md` to their canonical Japa owners.
Functional tests enter through generated named routes. Direct expiry, locking, idempotency, fanout,
and race proofs live in `integration` with committed disposable-PostgreSQL state.

## Booking requests

| Contract                                                                  | Canonical test                                                                      | Durable proof                                             |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Customer submits, lists, and reads a Space-only request                   | `tests/functional/requests/booking_requests.spec.ts`                                | Exact HTTP envelope and owned booking row                 |
| Initial request is pending and does not block inventory                   | `tests/functional/requests/booking_requests.spec.ts`                                | Zero holds/blocks before approval                         |
| Exact idempotent replay returns one request; changed payload conflicts    | Functional booking tests and `tests/integration/requests/workers_and_races.spec.ts` | One booking, key, submit audit, and stable 409            |
| Provider approval revalidates policy and publication                      | `tests/functional/requests/booking_requests.spec.ts`                                | Closure/suspension keep request pending with no hold      |
| Successful approval atomically creates one short payment hold and block   | `tests/functional/requests/booking_requests.spec.ts`                                | Accepted booking, active hold, active source-backed block |
| Reject and customer/provider cancellation preserve terminal history       | `tests/functional/requests/booking_requests.spec.ts`                                | Exact states, audit sequence, and released accepted hold  |
| Customer ownership, tenant hiding, read permission, and manage permission | `tests/functional/requests/booking_requests.spec.ts`                                | 200/403/404 and unchanged pending row                     |
| Simultaneous overlapping approvals permit one winner                      | `tests/functional/requests/booking_requests.spec.ts`                                | 200/409, one hold/block, one pending request              |

## Date inquiries

| Contract                                                                       | Canonical test                                         | Durable proof                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| Inquiry creation and replay are durable and non-blocking                       | `tests/functional/requests/inquiries.spec.ts`          | One inquiry/idempotency row and zero inventory blocks  |
| Customer and owning company can list/read; other identities and tenants cannot | `tests/functional/requests/inquiries.spec.ts`          | Exact owned IDs and 404 isolation                      |
| Company responses never expose customer email snapshots                        | `tests/functional/requests/inquiries.spec.ts`          | List/show/answer response allowlists                   |
| Provider answer remains readable independently of notification outbox          | `tests/functional/requests/inquiries.spec.ts`          | Durable message and answer audit after outbox deletion |
| Review, reject, answer, close, and customer cancel transitions are explicit    | `tests/functional/requests/inquiries.spec.ts`          | Exact status, events, and notification intent          |
| Viewer may read but not answer or transition                                   | `tests/functional/requests/inquiries.spec.ts`          | 403 and unchanged open inquiry                         |
| Company fanout follows effective permission and active membership              | `tests/integration/requests/workers_and_races.spec.ts` | Exact owner/staff recipients; revoked/denied excluded  |

## Visit requests

| Contract                                                             | Canonical test                                         | Durable proof                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Visit creation/replay, list/show, and audit are non-blocking         | `tests/functional/requests/visits.spec.ts`             | One visit, submit event, zero inventory blocks        |
| Company visit responses redact customer email                        | `tests/functional/requests/visits.spec.ts`             | List/show/transition response allowlists              |
| Provider confirms and completes a requested appointment              | `tests/functional/requests/visits.spec.ts`             | Ordered submit/confirm/complete events                |
| Changed time becomes a proposal requiring customer accept/reject     | `tests/functional/requests/visits.spec.ts`             | Alternative state followed by confirmed/cancelled     |
| Reversed, past, or elapsed intervals fail without partial history    | `tests/functional/requests/visits.spec.ts`             | Stable 422 code; state/version/event/outbox unchanged |
| Customer ownership, tenant scope, and visit permissions are enforced | `tests/functional/requests/visits.spec.ts`             | 200/403/404 and unchanged submitted visit             |
| Customer acceptance racing provider cancellation has one winner      | `tests/integration/requests/workers_and_races.spec.ts` | One terminal event and one version/transition failure |
| Overlapping venue visits cannot both be confirmed                    | `tests/integration/requests/workers_and_races.spec.ts` | One confirmed, one submitted, `VISIT_TIME_CONFLICT`   |

## Settings and expiry workers

| Contract                                                                         | Canonical test                                         | Durable proof                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| Space overrides set exact booking/inquiry/visit response horizons and quote hold | `tests/functional/requests/settings.spec.ts`           | Fixed-clock expiry instants and persisted settings     |
| Settings require manage permission and are tenant-hidden                         | `tests/functional/requests/settings.spec.ts`           | Read-only viewer, 403 mutation, 404 other tenant       |
| Pending inquiry/visit expiry is bounded and preserves history                    | `tests/integration/requests/workers_and_races.spec.ts` | Exact expired states, events, and outbox rows          |
| Concurrent workers claim every expired workflow once                             | `tests/integration/requests/workers_and_races.spec.ts` | Combined count and one event/notification per resource |
| Confirmed visits survive provider-response expiry                                | `tests/integration/requests/workers_and_races.spec.ts` | Confirmed state remains unchanged                      |

## Replacement gate

`tests/functional/requests.spec.ts` is replaced by focused `functional/requests/*` HTTP contracts,
`integration/requests/*` concurrency/worker invariants, and a typed request scenario builder. The
generated Japa registry includes all rewritten `user_requests.*`, `company_requests.*`, and audit
read routes. No functional request test invokes `RequestWorkflowService` directly.
