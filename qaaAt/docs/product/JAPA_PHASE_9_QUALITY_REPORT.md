# Japa Phase 9 Quality Report

Completed on 2026-07-18.

## Suite cleanup

- Removed the root `security_hardening.spec.ts` monolith after moving its unique contracts into
  bounded admin, authentication, booking HTTP, and booking integration specifications.
- Reused `tests/support/scenarios/legacy_bookings.ts` for the remaining legacy Hall/Booking setup.
- Replaced direct `testUtils.db().truncate()` calls with the guarded
  `withTruncateIsolation` boundary throughout the functional suite.
- Removed two payment recovery tests that monkey-patched private service methods. Durable replay,
  early-event correlation, bounded reconciliation, and worker concurrency remain covered through
  public operations and persisted state.
- Removed all explicit `any` from test and test-support code.

## Enforced repository rules

`npm run test:quality` scans the test tree and fails on:

- focused, skipped, pinned, or todo tests;
- imports of migration implementation details;
- explicit `any` in tests or shared fixtures;
- direct AdonisJS database-test utilities outside the guarded bootstrap/database boundary;
- new root-level functional monoliths other than the foundation smoke test.

The quality scanner has its own Japa specification. `npm run lint` executes the scanner, so the
rules are part of the normal repository gate rather than review-only guidance.

## Coverage evidence

The official Japa `c8` integration is available as `npm run test:coverage`. The Phase 9 full run
reported 268 passing tests and aggregate coverage of 91.74% statements, 82.16% branches, 83.76%
functions, and 91.74% lines. Coverage is retained as a gap detector; no percentage substitutes for
the contract and sensitivity evidence below.

## Sensitivity checks

Each mutation was temporary, produced the expected failing assertion, and was restored before the
final verification run.

| Protected rule        | Temporary mutation                                            | Canonical test that failed                                                        | Observed failure                                        |
| --------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Tenant scope          | Removed the company ID predicate from payment listing         | `company finance is tenant scoped and admin audit routes expose bounded metadata` | Two tenant rows were returned instead of one            |
| Webhook signature     | Bypassed provider signature verification                      | `one-byte changes, invalid signatures, and oversized HTTP bodies fail safely`     | Tampered bytes returned 200 instead of 401              |
| Idempotency           | Changed the duplicate webhook outcome guard                   | `duplicate trusted events are idempotent`                                         | `ignored` was returned instead of `duplicate`           |
| Transaction rollback  | Enqueued notification intent outside the supplied transaction | `keeps notification intent transactional and invisible after rollback`            | One outbox row survived rollback                        |
| Snapshot immutability | Removed the quote revision immutability trigger               | `sent revision lifecycle and line items are immutable at the database boundary`   | A forbidden update completed without PostgreSQL `23514` |
| Inventory overlap     | Removed the active-block exclusion constraint                 | `simultaneous overlapping reservations produce exactly one durable winner`        | Two overlapping reservations succeeded                  |

## Final ownership guarantees

- Functional tests enter through HTTP for the action being asserted; direct service calls are
  limited to scenario setup or separately owned integration specifications.
- Integration tests own PostgreSQL constraints, transaction behavior, workers, and races.
- Every database reset is guarded by the disposable-test-database assertion.
- The full suite contains no focused/skipped tests, migration imports, explicit test `any`, or
  root-level legacy feature monolith.

## References

- [Japa coverage](https://v2.japa.dev/docs/coverage)
- [AdonisJS testing](https://docs.adonisjs.com/guides/testing/introduction)
- [AdonisJS API tests](https://docs.adonisjs.com/guides/testing/api-tests)
- [AdonisJS state reset](https://docs.adonisjs.com/guides/testing/resetting-state-between-tests)
