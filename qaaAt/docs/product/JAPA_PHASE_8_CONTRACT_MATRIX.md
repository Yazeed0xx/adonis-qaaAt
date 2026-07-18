# Japa Phase 8 Contract Matrix

Status: completed on 2026-07-18.

Phase 8 replaces the notification/push monolith and the single admin regression with focused HTTP,
integration, job, and console contracts. PostgreSQL remains real; Expo delivery is represented by a
purpose-built provider fake; push is disabled in command tests. No test performs network delivery.

## HTTP contracts

| Surface                                        | Canonical specification                                | Contract proved                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer notification list/count/read/read-all | `tests/functional/notifications/customer.spec.ts`      | Authentication, owner-only reads and mutations, unread filtering, pagination, count accuracy, bulk scope, and internal-field redaction                                                                                                                                                                        |
| Company notification list                      | `tests/functional/notifications/company.spec.ts`       | Active employee access, missing/revoked membership denial, selected-company list/count/read isolation, and customer-inbox separation for shared identities                                                                                                                                                    |
| Customer push registration/revocation          | `tests/functional/push/customer_installations.spec.ts` | Verified-customer eligibility, validation, refresh idempotency, `customer_app` persistence, and token redaction                                                                                                                                                                                               |
| Company push registration/revocation           | `tests/functional/push/company_installations.spec.ts`  | Active-member eligibility, `company_app` persistence, atomic installation transfer, owner-scoped idempotent revocation, and token redaction                                                                                                                                                                   |
| Admin operational inspection                   | `tests/functional/admin/inspection.spec.ts`            | Admin-only access, pagination, pending-company inspection, and credential/token redaction                                                                                                                                                                                                                     |
| Admin company moderation                       | `tests/functional/admin/company_moderation.spec.ts`    | Approval state + audit + outbox atomicity, invalid-input rollback, authoritative suspension state, owner/employee company-session revocation, customer-session preservation, application-scoped push revocation, reasoned reactivation without session resurrection, and removal of legacy company ban routes |

Space/media moderation and financial inspection remain owned by their Phase 3 and Phase 7 canonical
specifications. Phase 8 does not duplicate them.

## Durable worker contracts

| Boundary                      | Canonical specification                                | Contract proved                                                                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notification outbox           | `tests/integration/notifications/outbox.spec.ts`       | Rollback removes intent, concurrent `SKIP LOCKED` workers create one notification/fan-out, repeated processing is idempotent, mobile app and target-Company context are isolated, suspended-Company delivery is denied, failures back off, poison rows dead-letter after five attempts |
| Scheduled maintenance adapter | `tests/integration/jobs/scheduled_maintenance.spec.ts` | One queue execution delegates once to the shared maintenance operation                                                                                                                                                                                                                 |

Permission-aware recipient selection remains additionally covered by:

- `tests/integration/requests/workers_and_races.spec.ts` for request/inquiry membership permission,
  deny overrides, inactive membership, and tenant selection.
- `tests/integration/quotes/workers_and_races.spec.ts` for quote-view recipient selection.
- the payment integration suite for finance-recipient durable intent.

## Console contracts

| Command                 | Canonical specification                       | Contract proved                                                                                                                                            |
| ----------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notifications:process` | `tests/console/notifications_process.spec.ts` | Actual Ace construction/execution, bounded `--limit`, distinct invalid-argument exit code, durable database effect, exact counters, and no remote push I/O |
| `maintenance:expire`    | `tests/console/maintenance_expire.spec.ts`    | Actual Ace construction/execution, all maintenance categories reported, and safe idempotent replay when nothing is due                                     |

Both commands use the same application services as their scheduled jobs. `CleanupExpiredBookingsJob`
now delegates to `ScheduledMaintenanceService`, preventing scheduler and operator paths from drifting.

## Production invariants introduced by the tests

- Every outbox payload that may fan out to push identifies `customer_app` or `company_app`.
- Fan-out requires an exact installation context match, so one shared User identity cannot cross mobile
  applications.
- `notification_outbox.failed_at` records terminal poison intent; failed rows are no longer reclaimed.
- Push notification bodies and data are allowlisted independently from private in-app notification
  content.
- Admin approval commits the state transition, audit record, and notification intent together;
  remote delivery remains after commit.
- Company suspension commits the state transition, selective access revocation, application-scoped
  push revocation, and reasoned admin audit together. Reactivation never restores revoked sessions.

## Verification record

- Phase 8 focused tests: 32 passed.
- Outbox concurrency stress: 5 consecutive focused runs passed.
- Full Japa suite: 274 passed.
- Disposable test and development databases: 101 migrations replayed successfully; the factory seed
  completed with the 4,000-booking/8,000-notification heavy scenario.
- TypeScript, ESLint, route discovery, command discovery, OpenAPI generation, and production build:
  passed.
