# Japa Phase 4 Contract Matrix

## Authority and scope

This matrix maps the approved availability and inventory contracts from
`BACKEND_MVP_IMPLEMENTATION_HANDOFF_EN.md` to their canonical Japa owners. Functional tests enter
through named HTTP routes. Direct service, worker, locking, rollback, and PostgreSQL constraint
proofs live in `integration` and use committed disposable-database state.

## Policy, sessions, exceptions, and public availability

| Contract                                                                            | Canonical test                                              | Durable proof                                                         |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Owners manage policy; viewers read but cannot mutate; other tenants see 404         | `tests/functional/availability/authorization.spec.ts`       | 200/403/404 plus unchanged policy                                     |
| Operating-hour overlaps and company range limits have stable errors                 | `tests/functional/availability/policies.spec.ts`            | Exact 422 domain codes                                                |
| Named sessions support create, update, list, delete, and reject overlap             | `tests/functional/availability/sessions.spec.ts`            | Exact response state and one durable row after failure                |
| Closed and modified-hours exceptions affect availability without becoming inventory | `tests/functional/availability/exceptions.spec.ts`          | Empty candidates/blocks and exact exception lifecycle                 |
| Published public availability uses venue-local wall time and UTC instants           | `tests/functional/availability/public_availability.spec.ts` | Riyadh 08:00 maps to exact 05:00Z slot                                |
| Draft Spaces and ambiguous/excessive public ranges are rejected                     | `tests/functional/availability/public_availability.spec.ts` | Exact 404/422 domain codes                                            |
| Hourly, session, full-day, multi-day, overnight, and missing-day calculations       | `tests/integration/availability/modes.spec.ts`              | Fixed slot shape and policy acceptance/rejection                      |
| Notice, advance, and duration limits are inclusive at their exact boundaries        | `tests/integration/availability/policy_boundaries.spec.ts`  | One-minute-below/above negative examples and exact-boundary positives |

## External reservations and inventory blocks

| Contract                                                                | Canonical test                                                 | Durable proof                                               |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| Owner creates, reschedules, feeds, and releases an external reservation | `tests/functional/availability/external_reservations.spec.ts`  | Source and block lifecycle through real HTTP                |
| Preparation/cleanup buffers expand blocking, not reservation instants   | `tests/functional/availability/external_reservations.spec.ts`  | Exact UTC start/end and blocked-from/until values           |
| Viewer and wrong-tenant mutations fail without changing source state    | `tests/functional/availability/external_reservations.spec.ts`  | 403/404 and unchanged active row                            |
| Holds require future expiry; timezone and instants must be explicit     | `tests/functional/availability/external_reservations.spec.ts`  | Stable 422 domain codes                                     |
| Failed external update rolls back its block mutation                    | `tests/integration/availability/external_reservations.spec.ts` | Source and block timestamps unchanged                       |
| Simultaneous overlapping external reservations have one winner          | `tests/integration/availability/external_reservations.spec.ts` | One source, block, and audit event; one `INVENTORY_OVERLAP` |
| Expiry workers claim an external hold once and release its block        | `tests/integration/availability/external_reservations.spec.ts` | One expiry event across concurrent workers                  |
| Inventory blocks require exactly one unique source                      | `tests/integration/availability/inventory_constraints.spec.ts` | PostgreSQL check/unique constraint rejection                |

## Booking holds and blocking semantics

| Contract                                                                     | Canonical test                                         | Durable proof                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Overlapping pending requests coexist; simultaneous acceptance has one winner | `tests/integration/availability/booking_holds.spec.ts` | One accepted, one pending, one hold, one block        |
| Schedule policy is checked at request creation and again at acceptance       | `tests/integration/availability/booking_holds.spec.ts` | Conflict leaves booking pending and creates no hold   |
| Payment-hold expiry transitions booking and releases inventory atomically    | `tests/integration/availability/booking_holds.spec.ts` | Expired hold, payment-expired booking, released block |
| Cancellation releases only the booking's active hold and block               | `tests/integration/availability/booking_holds.spec.ts` | Cancelled source and released block                   |

## Regression found by the rewrite

PostgreSQL serializes `time` columns as `HH:mm:ss`. The previous status-only overlap tests passed for
the wrong reason because persisted session/exception windows were fed back into an `HH:mm` input
validator and produced `WALL_TIME_INVALID`. Canonical tests now require `CALENDAR_WINDOWS_OVERLAP`,
and the calendar service normalizes persisted wall times before comparing windows.

## Replacement gate

`tests/functional/availability.spec.ts` is replaced by focused `functional/availability/*` HTTP
contracts and `integration/availability/*` invariant suites. The generated Japa route registry
includes all `company_calendar.*` and `public_availability.show` routes used by the rewrite.
