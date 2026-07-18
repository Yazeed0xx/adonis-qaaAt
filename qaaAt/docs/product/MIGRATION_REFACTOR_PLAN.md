# Migration Refactor Record

## Status

Completed on 2026-07-18 after confirming that every project database is disposable and that no API or database has been deployed.

The migration folder now defines the canonical MVP schema directly. It is not a compatibility history for the abandoned Hall prototype.

## Final rules

1. A create-table migration creates one table.
2. A migration has one schema concern and a descriptive filename.
3. Migrations import only framework migration primitives.
4. Migrations do not call models, services, application-domain helpers, or remote systems.
5. Migrations do not perform row-by-row workflows, wall-clock classification, or tenant backfills.
6. `defer()` callbacks are not used.
7. Lucid's schema builder owns ordinary columns, checks, indexes, and foreign keys.
8. Raw SQL is limited to structural PostgreSQL features that the schema builder cannot express cleanly, such as extensions, partial/expression indexes, and exclusion constraints.
9. PL/pgSQL functions and triggers do not implement application state machines.
10. Deterministic reference data and mobile acceptance data belong in seeders.
11. `database/schema.ts` is generated from a freshly migrated database and is never edited manually.
12. Functional tests exercise HTTP contracts; integration tests exercise services, concurrency, and database invariants without importing migration classes.

## Canonical domain decision

- A Venue is a physical or business location.
- A Space is the independently bookable unit inside a Venue.
- Booking, inquiry, visit, availability, pricing, quote, payment, and media workflows reference Space.
- There is no Hall table, Hall API, Hall model, Hall service, Hall backfill, or Hall compatibility trigger.
- Every Booking references its User, Company, Venue, and Space and stores immutable display snapshots.
- `request_to_book` Spaces create booking requests; `quote_required` Spaces create date inquiries and quotes.

## Removed migration behavior

The refactor removed:

- bundled migrations that created many unrelated tables;
- `halls`, the old `services` table, and `booking_services`;
- nullable `hall_id` compatibility and Hall-to-Space mapping columns;
- migration-owned Hall/Venue/Space and Booking backfills;
- runtime `Date` classification and row loops inside migrations;
- imported application functions and migration preflight helpers;
- the legacy Booking insert trigger;
- PL/pgSQL quote, payment, refund, and snapshot state-machine functions;
- deferred foreign keys that were unnecessary for the implemented transaction order;
- tests that executed migration `up` or `down` methods as feature fixtures.

Relational integrity remains enforced with ordinary checks, unique constraints, composite foreign keys, partial indexes, and the inventory exclusion constraint. Business transitions are enforced by application services and verified through Japa HTTP, integration, concurrency, and worker tests.

## Seed contract

`database/seeders/main_seeder.ts` supports the deterministic `mobile` profile only. It creates:

- customer, admin, and company identities;
- one current membership per company-app identity;
- a canonical Venue with request-to-book and quote-required Spaces;
- availability policies and operating hours;
- pricing, booking-request, inquiry, quote, payment-hold, notification, and controlled-media acceptance scenarios.

Unsupported seed profiles fail explicitly. The seed does not create Hall compatibility data.

## Verification

The completed refactor is accepted only when all of the following pass:

```bash
NODE_ENV=test node ace migration:fresh --force
NODE_ENV=test node ace db:seed
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Current verified result:

- 83 focused migrations apply from an empty PostgreSQL database.
- The generated Lucid schema contains no Hall or legacy Space columns.
- The deterministic mobile seed completes.
- Type checking, linting, and the test-suite quality gate pass.
- Japa passes 259 tests across unit, integration, functional, and console suites.
- The production build and OpenAPI generation pass.
