# Japa Phase 6 Contract Matrix

## Authority and scope

This matrix assigns the pricing and quote contracts from
`BACKEND_MVP_IMPLEMENTATION_HANDOFF_EN.md` to one canonical test layer. Functional tests exercise
generated named routes through the real HTTP stack. PostgreSQL constraints, direct workers, and
concurrency use committed disposable-database state in integration tests.

## Pricing catalog

| Contract                                                               | Canonical test                                  | Durable proof                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| Rate plans and services persist exact integer minor units              | `tests/functional/pricing/catalog.spec.ts`      | Provider and public response values                     |
| Public pricing exposes only active Space-attached records              | `tests/functional/pricing/catalog.spec.ts`      | Archive immediately removes service from public catalog |
| Pricing-mode-specific fields cannot contradict the mode                | `tests/functional/pricing/catalog.spec.ts`      | Stable `RATE_PLAN_MODE_INVALID` response                |
| Pricing management follows active membership and effective permissions | `tests/functional/pricing/catalog.spec.ts`      | Explicit deny and revoked membership return 403         |
| Packages preserve normalized service and descriptive items             | `tests/functional/pricing/packages.spec.ts`     | Provider and public item serialization                  |
| Foreign-company services cannot enter a package                        | Functional package test and integration FK test | Tenant-hidden HTTP failure and composite FK rejection   |

## Quote revisions and customer actions

| Contract                                                                      | Canonical test                                       | Durable proof                                             |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| Server owns subtotal, VAT, total, deposit, and remaining calculations         | `tests/functional/quotes/revisions.spec.ts`          | Exact string minor units from catalog inputs              |
| Inclusive/exclusive VAT is snapshotted and mixed policies fail                | `tests/functional/quotes/revisions.spec.ts`          | Exact line VAT plus `QUOTE_TAX_POLICY_MIXED`              |
| Sending freezes a revision; a later edit creates a new draft                  | Functional revision test and database invariant test | Historical total unchanged; trigger rejects line mutation |
| Catalog edits and archival cannot rewrite sent commercial history             | `tests/functional/quotes/revisions.spec.ts`          | Provider and customer reads retain sent money/tax values  |
| Unsafe JavaScript integer amounts remain exact                                | `tests/functional/quotes/money.spec.ts`              | Exact total/deposit/remaining strings                     |
| Aggregate and multiplication overflow fail as a domain error                  | `tests/functional/quotes/money.spec.ts`              | Stable `QUOTE_AMOUNT_INVALID`                             |
| Acceptance copies the exact commercial snapshot to the booking                | `tests/functional/quotes/money.spec.ts`              | Unsafe integer and decimal representations stay exact     |
| Draft/sent quotes are non-blocking; acceptance creates one booking/hold/block | `tests/functional/quotes/lifecycle.spec.ts`          | Zero inventory before acceptance and exact final rows     |
| Space suspension rolls acceptance back                                        | `tests/functional/quotes/lifecycle.spec.ts`          | Sent quote remains; no booking exists                     |
| Decline preserves history and notification intent                             | `tests/functional/quotes/lifecycle.spec.ts`          | Terminal status, ordered events, outbox rows              |
| Provider withdrawal is terminal and customer-visible                          | `tests/functional/quotes/lifecycle.spec.ts`          | Withdrawn response and exactly one audit event            |
| Customer ownership, provider tenant scope, and internal-note redaction        | `tests/functional/quotes/lifecycle.spec.ts`          | Owned 200, outsider 404, no internal notes                |

## Database and concurrency

| Contract                                                                 | Canonical test                                         | Durable proof                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------- |
| Sent/superseded revisions and sent line items are immutable              | `tests/integration/quotes/database_invariants.spec.ts` | PostgreSQL `23514` on insert/update/delete/reversal |
| Catalog and revision references cannot cross tenant/aggregate boundaries | `tests/integration/quotes/database_invariants.spec.ts` | Composite FKs return `23503`                        |
| Concurrent acceptance has one winner                                     | `tests/integration/quotes/workers_and_races.spec.ts`   | One booking, hold, and block                        |
| Overlapping sent quotes coexist but only one acquires inventory          | `tests/integration/quotes/workers_and_races.spec.ts`   | Loser remains sent with `INVENTORY_OVERLAP`         |
| Concurrent expiry workers claim once                                     | `tests/integration/quotes/workers_and_races.spec.ts`   | Combined count one and one expiry event             |
| Acceptance fanout honors effective permission and membership state       | `tests/integration/quotes/workers_and_races.spec.ts`   | Exact active allowed recipient set                  |

## Replacement gate

The 1,074-line `tests/functional/pricing_quotes.spec.ts` is removed. Its contracts now live in five
focused HTTP files, two integration files, and a typed shared scenario builder. Functional pricing
and quote tests use generated named routes; integration tests construct state through domain services
and never depend on the HTTP router.
