# Japa Test Suite Rewrite Plan

## Status

Completed on 2026-07-18. The final suite passes 259 tests across unit, integration, functional, and console suites. Type checking, linting, the quality gate, migration freshness, deterministic seeding, and the production build also pass.

The dated phase notes below are retained as implementation history. References to Hall compatibility describe an intermediate phase and are not the current contract. Because the application and databases were confirmed undeployed and disposable, the final architecture removed the Hall API, schema, fixtures, and compatibility tests in favor of the canonical Venue/Space contract documented in the backend handoff and mobile guides.

Official-documentation audit completed on 2026-07-17 against the current Japa v2 and AdonisJS
testing guides. Every proposed API must also exist in the installed package version before it is used.

The Japa 5 compatibility gate was completed on 2026-07-17. `@japa/runner` was upgraded from 4.5.0 to
5.3.0, its installed peer tree is valid, and focused capability tests prove `freezeTime`,
`timeTravel`, and automatic clock restoration. The complete suite, typecheck, lint, and production
build pass after the upgrade.

The final verified baseline is 259 passing Japa tests. Existing tests were removed only after their replacement proved the approved contract with stronger assertions.

The first Phase 1 foundation slice was completed on 2026-07-17:

- Lucid database assertions are registered in Japa;
- the runner rejects a non-test database name, migrates once, and guarantees an empty initial state;
- explicit transaction and truncate isolation helpers are available;
- `integration` and `console` suites exist, and the HTTP server starts only for `functional`;
- typed customer, admin, company-owner, and company-member builders plus a controlled clock helper
  are available;
- the database and real-HTTP capability tests pass, and the database-backed Hall service tests now
  live in `integration`;
- the invitation-acceptance concurrency test uses a deterministic identity, asserts one winner and
  one conflict, and passed five isolated stress runs.

The generated Japa route registry was also trialed against the current suite. Enabling every route
globally correctly exposed existing request/response contract type drift in several legacy
functional files. Phase 2 now augments Japa with a generated-registry `Pick` containing only its
rewritten routes. Later phases must extend that typed registry as they repair their own contracts;
the drift will not be hidden with casts.

Phase 2 was completed on 2026-07-17:

- the approved handoff requirements are mapped in `JAPA_PHASE_2_CONTRACT_MATRIX.md`;
- customer, company, and admin authentication; company context; member access/mutations; and
  invitation management/acceptance are split into focused files;
- functional tests enter through HTTP, while direct company-context service behavior lives in
  `integration`;
- company registration uses a fake private disk and a deterministic test malware-scanner process;
- test rate limiting uses the disposable database store, so throttling state is cleaned with the
  rest of the test database;
- invitation acceptance concurrency is tested through two real HTTP requests and passed five
  isolated stress runs;
- the two replaced monolithic specs and the direct-service functional context spec were removed;
- the complete suite passes with 219 tests.

Phase 3 was completed on 2026-07-17:

- the approved Venue, Space, discovery, legacy Hall, and controlled-media contracts are mapped in
  `JAPA_PHASE_3_CONTRACT_MATRIX.md`;
- the four legacy monoliths were replaced by focused `functional/spaces`, `functional/discovery`,
  and `functional/media` endpoint families;
- direct Hall synchronization, discovery batching/query budgets, media concurrency, and cleanup
  processing now live in `integration`;
- duplicated raw-SQL media setup was replaced by typed Space/media scenario builders;
- the generated Japa registry now includes every rewritten Phase 2 and Phase 3 route, and response
  ambiguity is handled with runtime shape guards rather than casts;
- company mutations prove permission and tenant isolation with unchanged-state assertions, while
  public delivery proves publication, owner, moderation, storage-key, and cache-header boundaries;
- the complete suite passes with 223 tests.

## Outcome

Rewrite the test suite into small, typed, behavior-focused Japa tests that:

- exercise HTTP features through the real AdonisJS route, middleware, authentication, validation,
  controller, service, database, and transformer pipeline;
- isolate pure domain logic in fast unit tests;
- isolate database-backed service and invariant checks in an integration suite;
- use real PostgreSQL/Lucid behavior and fake only external boundaries;
- make tenant isolation, authorization, state transitions, idempotency, money, inventory, and audit
  side effects explicit;
- use deterministic clocks and typed test data builders;
- are readable by feature instead of accumulating thousand-line sprint files.

This is not a coverage-percentage exercise. Completion is measured against the product contracts and
risk matrix in this plan.

## Contract authority during the rewrite

When an existing test disagrees with another source, use this order:

1. `docs/product/BACKEND_MVP_IMPLEMENTATION_HANDOFF_EN.md`.
2. Current mobile handoffs and documented public API contracts.
3. Security and commercial invariants enforced by the database/application.
4. Existing observable behavior that the handoff explicitly says to preserve.
5. Existing tests, after confirming that they test a public contract rather than an implementation
   detail.

A suspicious test does not become a product requirement merely because it currently passes.

## The rewritten suite as executable source of truth

After a feature slice is rewritten and accepted, its Japa tests become the canonical executable
specification for backend behavior. That means:

- a production change that contradicts a canonical test is a regression unless the product contract
  is deliberately changed;
- changing a canonical test requires an explicit product reason, not “the implementation currently
  behaves differently” or “this assertion is inconvenient”;
- an approved contract change updates the handoff/API documentation, canonical tests, OpenAPI
  contract where applicable, and implementation together;
- each behavior has one canonical owner test instead of conflicting copies spread across files;
- test names describe actor, precondition, action, and observable outcome;
- functional contract tests assert public behavior and durable effects, never private method calls or
  internal call order;
- `assertAgainstApiSpec()` may supplement explicit assertions only after the project's OpenAPI Japa
  integration is configured and verified; it never replaces business assertions;
- coverage reports are gap-finding evidence, not proof that behavior is correct;
- critical tests must pass a sensitivity check: temporarily breaking the protected rule must make the
  expected test fail for the expected reason.

The suite cannot invent an ambiguous product decision. Ambiguity is resolved against the approved
handoff first, then encoded permanently in a canonical test.

## Official-doc and installed-version compatibility

The official docs describe current Japa/Adonis testing capabilities, but this repository's installed
versions remain the implementation API truth:

| Package                    | Installed during audit | Relevant result                                                    |
| -------------------------- | ---------------------: | ------------------------------------------------------------------ |
| `@japa/runner`             |                  5.3.0 | Exports the verified `freezeTime` and `timeTravel` utilities       |
| `@japa/assert`             |                  4.2.0 | Supports Japa assertion context and assertion planning             |
| `@japa/api-client`         |                  3.2.1 | Supports real HTTP requests and response assertions                |
| `@japa/plugin-adonisjs`    |                  5.2.0 | Supports test-context `swap` and helper-level `useFake`            |
| `@adonisjs/lucid`          |                 22.4.2 | Exposes database assertions; prefers `wrapInGlobalTransaction()`   |
| `@japa/openapi-assertions` |          not installed | Do not call `assertAgainstApiSpec()` until deliberately configured |
| `@japa/file-system`        |          not installed | Add only if local temporary-file tests need it                     |

The installed AdonisJS plugin declares compatibility with Japa runner 4 or 5. The upgrade to runner
5.3.0 passed the focused capability test and every repository verification gate, so the rewrite may
use the installed and type-checked time-control APIs.

## Current audit

The suite currently contains 18 spec files and 7,731 lines. The largest files are:

| File                                       | Lines | Main issue                                                                                          |
| ------------------------------------------ | ----: | --------------------------------------------------------------------------------------------------- |
| `tests/functional/payments.spec.ts`        | 1,465 | HTTP, direct services, webhook fixtures, reconciliation, RBAC, refunds, and concurrency in one file |
| `tests/functional/pricing_quotes.spec.ts`  | 1,074 | Catalog, packages, quote lifecycle, snapshots, expiry workers, and concurrency in one file          |
| `tests/functional/requests.spec.ts`        |   777 | Booking requests, inquiries, visits, permissions, expiry, and jobs in one file                      |
| `tests/functional/availability.spec.ts`    |   739 | Rules, exceptions, inventory, legacy compatibility, and overlap behavior in one file                |
| `tests/functional/space_discovery.spec.ts` |   540 | Filtering, sorting, pagination, availability scanning, serialization, and limits in one file        |
| `tests/functional/space_media.spec.ts`     |   494 | Upload validation, moderation, access, storage, cleanup, and publication behavior in one file       |

Observed structural problems:

- all database-backed tests are mixed into `unit` or `functional`; there is no integration suite;
- 14 spec files truncate the database independently;
- 9 spec files invoke the reference-data seeder directly;
- large local `setup()` functions repeatedly create owners, companies, memberships, legacy Halls,
  Spaces, bookings, holds, and inventory rows;
- functional files directly call services and workers alongside HTTP requests;
- fixture creation uses raw SQL and untyped `any` helpers in several high-risk files;
- many time-sensitive fixtures use `DateTime.now()` or `new Date()` without freezing the clock;
- assertions frequently inspect ad hoc response fragments or query raw tables instead of using
  typed helpers and Lucid database assertions;
- broad sprint-oriented groups make failures hard to locate and setup hard to understand.

## Non-negotiable test rules

1. A functional API test enters through an HTTP route. It must not call the controller's service to
   perform the action under test.
2. A database-backed service test belongs in `integration`, not `unit` or HTTP `functional`.
3. A unit test has no database, HTTP server, filesystem, queue, mailer, or framework boot dependency.
4. Do not mock Lucid models, the query builder, Adonis authentication, middleware, validators, or
   transactions. Use the real application and isolated test database.
5. Fake only external boundaries: payment provider, malware/image verification provider, object
   storage, mail transport, push transport, and other remote I/O.
6. Every time-dependent test freezes or explicitly controls time. No test outcome may depend on the
   wall clock or execution speed.
7. Test builders create state; they do not contain assertions or silently perform the behavior under
   test.
8. Production seeders are not general fixture factories. The idempotent reference-data seeder may be
   used only when a feature genuinely depends on controlled categories, amenities, or response
   policies.
9. Avoid raw SQL in tests. It is allowed only when the test is specifically proving a PostgreSQL
   constraint, trigger, lock, or database-only invariant that Lucid cannot express clearly.
10. Do not copy production algorithms into expected-value helpers. Use explicit examples and fixed
    expected results.
11. Do not import migrations, invoke migration classes, or mutate the schema inside a feature test.
12. Do not accept weak checks such as “not 500”, status-only success assertions, or error-message-only
    assertions when a stable error code exists.
13. Every tenant-owned mutation covers allowed tenant, wrong tenant, insufficient permission,
    suspended/inactive membership where applicable, and the unchanged database state after denial.
14. Every multi-write commercial workflow verifies its primary record, dependent records, audit or
    outbox intent, and the absence of partial writes on failure.
15. Keep Japa groups flat. Use directories and focused files for hierarchy, because Japa does not
    support nested groups.
16. Return cleanup functions from setup hooks for state created by those hooks. Prefer built-in fakes,
    `using`, `swap`, and `useFake` when their installed versions provide automatic restoration.
17. Use typed Japa datasets with `.with(...).run(...)` and descriptive interpolated titles for input
    matrices. Do not hide complex stateful workflows inside giant datasets.
18. Use assertion planning for conditional/callback assertion paths that could otherwise pass without
    executing an assertion. Prefer direct rejection assertions for ordinary promise failures.

## Target suite layout

```text
tests/
  bootstrap.ts
  support/
    actors.ts
    auth.ts
    clock.ts
    database.ts
    external_fakes.ts
    reference_data.ts
    scenarios/
      company.ts
      space.ts
      availability.ts
      request.ts
      quote.ts
      payment.ts
  unit/
    domain/
    services/
    security/
  integration/
    availability/
    inventory/
    requests/
    quotes/
    payments/
    jobs/
  functional/
    auth/
    memberships/
    spaces/
    discovery/
    media/
    availability/
    requests/
    quotes/
    payments/
    notifications/
    admin/
  console/
```

Files are named after one behavior or endpoint family, for example:

```text
tests/functional/payments/initiate.spec.ts
tests/functional/payments/webhook.spec.ts
tests/functional/payments/cancellation.spec.ts
tests/integration/payments/webhook_idempotency.spec.ts
tests/integration/payments/reconciliation.spec.ts
```

Do not replace the current large files with one global “test helpers” module. Scenario builders remain
small and domain-specific, return typed records/identifiers, accept explicit overrides, and compose
lower-level factories.

## Japa and AdonisJS bootstrap

Update the Japa configuration before rewriting features:

1. Keep `assert()`, `apiClient()`, `authApiClient(app)`, and `pluginAdonisJS(app)`.
2. Register Lucid's `dbAssertions(app)` plugin. The installed methods are `assertHas`,
   `assertMissing`, `assertCount`, `assertEmpty`, `assertModelExists`, and `assertModelMissing`.
3. Run migrations once in the runner setup, as the suite already does.
4. Guarantee a clean baseline at runner start, including recovery after a previously interrupted
   test run. The installed `truncate()` hook returns an after-test cleanup; it does not by itself
   erase leftover rows before the first test executes.
5. Start the HTTP server only for `functional` tests.
6. Add `integration` and `console` suites with appropriate timeouts rather than hiding those tests in
   `functional`.
7. Use returned Japa cleanup functions for setup-owned state. Do not rely on unrelated teardown hooks
   to guess which setup completed.
8. Prefer `client.visit('route.name')` for named route contracts and generated route typing. Use
   literal HTTP methods/URLs when the literal URI itself is the compatibility contract.
9. Add `@japa/file-system` only after a version check and use its disposable `fs` context for tests
   that create local files. Continue using Drive fakes for configured storage disks.
10. Centralize cleanup for Redis, limiter, cache, locks, queue state, fake transports, controlled
    clocks, and other mutable external state.

### Database isolation policy

Use isolation based on how the test actually communicates with PostgreSQL:

| Suite/test kind                 | Isolation                                       | Reason                                                           |
| ------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| Pure unit                       | none                                            | It must not use the database                                     |
| Single-connection integration   | global transaction rollback                     | Fast and isolated when all queries share the transaction context |
| HTTP functional                 | per-test truncate cleanup                       | The HTTP server may use a different pooled connection            |
| Concurrency/locking             | per-test truncate cleanup                       | Parallel transactions must see committed setup state             |
| Queue/job/after-commit behavior | per-test truncate cleanup                       | Workers and after-commit behavior require committed visibility   |
| Database constraints/triggers   | transaction when compatible; otherwise truncate | Choose the mode that exposes the real PostgreSQL behavior        |

Use the installed Lucid 22.4.2 `wrapInGlobalTransaction()` method; the official guide's
`withGlobalTransaction()` example calls a deprecated alias in this version. Both
`wrapInGlobalTransaction()` and `truncate()` return cleanup functions for Japa hooks, so return them
directly from `group.each.setup`. Never run concurrent tests inside one global transaction. Never mix
transaction isolation and truncate isolation implicitly within the same group.

### Japa organization and false-positive prevention

- Use one flat group per cohesive behavior/configuration boundary; use subdirectories instead of
  nested groups.
- Use typed datasets for validation, roles, permissions, states, and boundary tables when setup and
  assertions are genuinely identical.
- Give dataset rows names so the reporter identifies the exact failed contract.
- Use `assert.plan()` when assertions occur only inside a callback or conditional branch.
- Remove `.pin()`, accidental todo tests, and unjustified `.skip()` before merging.
- Return setup cleanup functions and use automatically restored built-in fakes/container swaps.
- Keep `forceExit: false`; open handles must be fixed instead of hidden by terminating the runner.

## Assertion standard

Each functional success test should prove, as applicable:

- exact HTTP status;
- stable response envelope and important serialized fields;
- absence of private fields such as storage keys, secrets, internal notes, or cross-tenant IDs;
- expected primary database write;
- expected dependent writes, snapshots, audit events, and outbox rows;
- absence of duplicate or partial rows;
- server-authoritative company IDs, totals, taxes, statuses, and ownership.

Each failure test should prove:

- exact HTTP status and stable application error code;
- no forbidden state transition;
- no cross-tenant information leak (use `404` where the contract requires resource hiding);
- no partial database writes, inventory block, payment attempt, audit event, or outbox event;
- retries remain safe when idempotency is part of the contract.

For money, assert integer minor-unit strings and immutable snapshots. Do not compare JavaScript
floating-point totals. For concurrency, assert the final database invariant, not which promise happens
to finish first.

## Feature rewrite order

The rewrite proceeds vertically. A phase is merged only while the full suite remains green.

### Phase 0 — Freeze and classify the baseline

- Preserve the completed `@japa/runner` 5.3.0 compatibility baseline and its focused time-control
  capability tests.
- Compile a small capability test for every planned helper (`dbAssertions`, route-name visits,
  authentication, filesystem, external fakes, clock control, and cleanup) before adopting it.
- Prove the runner starts from empty disposable database/storage/Redis state even after simulating an
  interrupted previous run.
- Record every existing test by route/service, approved behavior, risk, and current assertion strength.
- Mark tests as `keep`, `rewrite`, `split`, `move to integration`, or `delete as implementation detail`.
- Record runtime and flaky failures across repeated full-suite runs.
- Create a contract matrix for every public route from `start/routes.ts`.
- Do not delete tests in this phase.

Exit gate: every current test has an owner, every public route is mapped to a feature domain, and no
planned helper relies on an API absent from the selected package versions.

### Phase 1 — Build the test foundation

- Register `dbAssertions(app)`.
- Add `integration` and `console` suites.
- Implement database isolation helpers with an explicit `wrapInGlobalTransaction()`/truncate choice
  and an initial clean-baseline preflight.
- Add a controlled-clock helper with a fixed Riyadh/UTC reference instant using the verified
  `freezeTime` and `timeTravel` exports from the installed Japa runner.
- Add typed actor and scenario builders for owner, employee, customer, company, membership, venue,
  Space, availability policy, booking, quote, and payment.
- Add scoped fakes for payment, storage, image verification, mail, push, and queue delivery.
- Add typed datasets for repeated validation/permission matrices and assertion planning for
  conditional asynchronous paths.
- Remove raw SQL and `any` from shared test setup.

Exit gate: one representative unit, integration, HTTP, concurrency, and external-boundary test passes
using the new foundation.

### Phase 2 — Authentication, client context, memberships, and RBAC

Status: completed on 2026-07-17. The canonical route/risk ownership is recorded in
`JAPA_PHASE_2_CONTRACT_MATRIX.md`.

Rewrite first because authorization mistakes affect every later feature:

- registration, login, verification, token revocation, and deleted/suspended identities;
- separate customer-app and company-app authorization contexts;
- invitation creation and acceptance for new and existing identities;
- membership status, role presets, permissions, tenant selection, and session revocation;
- cross-company resource hiding and unchanged-state assertions.

Split the current auth, company-context, membership, and related security-hardening cases by endpoint
and policy.

Exit gate: the mandatory security tests in handoff section 7.8 are represented in the contract matrix
and pass through HTTP.

### Phase 3 — Venues, Spaces, moderation, discovery, and media

Status: completed on 2026-07-17. The canonical route/risk ownership is recorded in
`JAPA_PHASE_3_CONTRACT_MATRIX.md`.

- venue/Space creation and category-specific validation;
- moderation and publication state machine;
- legacy Hall compatibility only where the handoff still requires it;
- public serialization, locale behavior, filtering, sorting, pagination, and availability filters;
- controlled media upload, verification, moderation, cover selection, access, cleanup outbox, and
  private storage boundaries.

Split discovery performance/batch behavior and database query invariants into integration tests; keep
public request/response contracts in functional tests.

Exit gate: public APIs never expose tenant-private or storage-private data, and all company mutations
are tenant-scoped and permission-tested.

### Phase 4 — Availability, external reservations, holds, and inventory

Status: completed on 2026-07-17. The canonical route/risk ownership is recorded in
`JAPA_PHASE_4_CONTRACT_MATRIX.md`.

- operating hours, policies, exceptions, buffers, notice, advance limits, and timezone boundaries;
- external reservation lifecycle;
- non-blocking requests versus blocking confirmed bookings and active holds;
- hold expiry and cleanup;
- database overlap/exclusion constraints;
- simultaneous attempts for the same Space/time range.

Use fixed instants around Riyadh day boundaries and daylight/timezone conversion even though Riyadh
currently has a fixed offset. Database exclusion and locking cases belong in integration tests with
committed setup state.

Exit gate: every source of inventory blocking has positive, negative, expiry, and concurrency coverage.

### Phase 5 — Requests, inquiries, visits, and workflow expiry

Status: completed on 2026-07-17. The canonical route/risk ownership is recorded in
`JAPA_PHASE_5_CONTRACT_MATRIX.md`.

Replace `requests.spec.ts` with focused files for:

- booking request creation and idempotent replay;
- provider approval/rejection and short payment hold creation;
- inquiry creation, messages, response, cancellation, and expiry;
- visit request, confirmation, alternative proposal/acceptance, cancellation, and expiry;
- tenant/RBAC boundaries;
- cleanup job behavior and retry safety.

HTTP tests prove user-visible state machines. Direct worker/service execution moves to integration.

Exit gate: every allowed transition, forbidden transition, stale lock version, idempotent replay, and
expiry boundary has an exact contract assertion.

### Phase 6 — Pricing, packages, services, and quotes

Status: completed on 2026-07-17. The canonical route/risk ownership is recorded in
`JAPA_PHASE_6_CONTRACT_MATRIX.md`.

Replace `pricing_quotes.spec.ts` with focused catalog and quote lifecycle suites:

- rate plans, service options, packages, and category pricing modes;
- server-calculated subtotal, tax, discount, deposit, and total minor units;
- draft revision updates and immutable sent revisions;
- send, supersede, customer action, acceptance, rejection, cancellation, and expiry;
- accepted quote snapshots copied to the booking;
- quote acceptance creating exactly one hold and preventing overlapping acceptance;
- expiry worker claiming each quote once.

Pure money calculations may be unit-tested only when they are exposed as pure domain functions. The
HTTP suite still proves the server ignores client-supplied totals.

Exit gate: commercial snapshots are immutable, integer-safe, tenant-safe, and concurrency-safe.

### Phase 7 — Payments, webhooks, cancellations, refunds, and reconciliation

Status: completed on 2026-07-17. The canonical route/risk ownership is recorded in
`JAPA_PHASE_7_CONTRACT_MATRIX.md`.

Rewrite the highest-risk file last, after the builders and inventory/quote fixtures are trusted:

- payment eligibility, initiation, idempotency, and retry;
- signed webhook raw-body verification, payload limits, duplicate events, invalid signatures, event
  ordering, and terminal-state protection;
- full/deposit success and inventory confirmation;
- failure and expiry without partial confirmation;
- cancellation policy snapshots and refund calculations;
- customer/company cancellation permissions;
- refund creation, provider retry, duplicate prevention, and terminal states;
- receipts, finance/admin list serialization, audit history, and reconciliation;
- concurrent webhook, initiation, cancellation, and refund attempts.

The fake provider must be exercised through the same trusted boundary a production provider will use.
Tests must never mark a booking paid by writing the final status directly unless constructing a narrow
precondition for a different behavior.

Exit gate: every financial transition proves idempotency, exact minor-unit amounts, immutable
snapshots, audit/outbox intent, and rollback on failure.

### Phase 8 — Notifications, jobs, scheduler, console, and admin operations

Status: completed on 2026-07-18. The canonical route, worker, command, and risk ownership is recorded
in `JAPA_PHASE_8_CONTRACT_MATRIX.md`.

- notification eligibility by app context, membership permission, and tenant;
- transactional outbox creation versus post-commit remote delivery;
- retry/dead-letter behavior without duplicate business effects;
- scheduled expiry/cleanup commands and job idempotency;
- minimum admin inspection and moderation contracts;
- sensitive-field redaction in admin and operational responses.

Exit gate: no test performs real remote I/O, while every delivery intent and retry rule is observable.

### Phase 9 — Remove the legacy suite and enforce quality gates

Status: completed on 2026-07-18. Cleanup ownership, repository guards, coverage evidence, and the
six required sensitivity checks are recorded in `JAPA_PHASE_9_QUALITY_REPORT.md`.

- Delete a legacy spec only when all of its approved behavior is linked to replacement tests.
- Remove duplicated local setup functions, obsolete direct-service functional cases, copied
  algorithms, raw fixture SQL, and unjustified `any`.
- Add lint rules or repository checks for migration imports in tests and focused/skipped tests.
- Add a coverage report as a gap detector, without treating a percentage as sufficient evidence.
- Perform targeted sensitivity checks against the highest-risk contracts by temporarily disabling a
  tenant filter, signature check, idempotency guard, transaction rollback, snapshot immutability rule,
  and inventory overlap protection. Each mutation must be caught by its named canonical test.
- Run the complete verification matrix repeatedly to expose order dependence and leaked state.

Exit gate: no legacy monolith remains, no feature depends on test order, and the Definition of Done is
fully satisfied.

## Per-feature contract matrix

Maintain a table during implementation with one row per route or externally invoked job:

| Contract          | Required cases                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Authentication    | unauthenticated, wrong client context, revoked token, valid actor                                                      |
| Authorization     | allowed role, missing permission, inactive membership, suspended company                                               |
| Tenancy           | same tenant, wrong tenant, missing resource, no data leak                                                              |
| Validation        | valid boundary, required fields, invalid enum/type/range, unknown client-owned fields ignored or rejected per contract |
| State machine     | every allowed edge, every important forbidden edge, terminal-state retry                                               |
| Persistence       | primary row, dependent rows, snapshots, audit/outbox, absence on failure                                               |
| Idempotency       | first request, exact replay, conflicting replay, concurrent replay                                                     |
| Time              | before boundary, exact boundary, after boundary, timezone conversion                                                   |
| Concurrency       | competing valid operations and final database invariant                                                                |
| Serialization     | exact envelope, minor-unit strings, pagination metadata, private-field absence                                         |
| External boundary | success, retryable failure, permanent failure, duplicate callback/event                                                |

Not every route needs every row. Every omitted risk must be consciously marked not applicable.

## Execution and verification gates

During each slice, run the narrow test first, then its suite, then the repository gates:

```bash
node ace test functional --files="payments/webhook"
node ace test functional
node ace test
npm run typecheck
npm run lint
npm run build
```

Database foundation changes also require:

```bash
node ace migration:fresh --seed
```

Before declaring the rewrite complete, run the full suite multiple times and in a different file/group
order where Japa configuration permits. There must be no focused tests, skipped tests without a linked
reason, leaked fake state, open handles, truncation deadlocks, or order-dependent failures.

## Definition of Done

The rewrite is complete only when:

- every approved MVP route and background workflow is present in the contract matrix;
- unit tests are pure, integration tests own database-level behavior, and functional tests enter via
  HTTP;
- all HTTP tests exercise real authentication, middleware, validation, transactions, and
  transformers;
- Lucid database assertions replace repeated ad hoc database checks where applicable;
- time-sensitive behavior uses a controlled clock;
- external services are faked only at their boundary and restored after each test;
- setup-owned state is cleaned with returned cleanup functions or automatically restored official
  fakes/swaps;
- groups remain flat, with directories providing test hierarchy;
- conditional assertion paths cannot pass with zero executed assertions;
- no functional test imports a migration or directly calls the service action it claims to test;
- no shared fixture helper uses raw SQL or `any` without a documented, unavoidable reason;
- tenant, permission, wrong-owner, invalid-state, idempotency, rollback, and concurrency risks are
  covered for commercial mutations;
- the full suite, typecheck, lint, build, and fresh migration/seed gates pass;
- repeated runs produce the same result without deadlocks, flakes, or test-order dependence;
- targeted sensitivity checks prove the critical suite fails when protected rules are broken;
- old tests and helpers have been deleted only after traceable replacement.

## Handling product bugs discovered during the rewrite

The test rewrite itself does not silently change production behavior. When a rewritten test exposes a
real discrepancy:

1. Confirm the intended behavior against the handoff and current API contract.
2. Add the smallest failing regression test at the correct test layer.
3. Record the production fix as a separate change from mechanical test movement where practical.
4. Verify the complete affected state machine, not only the single failing example.

This keeps “making the tests pass” from becoming permission to weaken application behavior.

## References

- [Japa v2 documentation](https://v2.japa.dev/docs)
- [AdonisJS testing introduction](https://docs.adonisjs.com/guides/testing/introduction)
- [AdonisJS API tests](https://docs.adonisjs.com/guides/testing/api-tests)
- [AdonisJS database assertions](https://docs.adonisjs.com/guides/testing/database-assertions)
- [AdonisJS resetting state between tests](https://docs.adonisjs.com/guides/testing/resetting-state-between-tests)
- [AdonisJS test doubles](https://docs.adonisjs.com/guides/testing/test-doubles)
- [Lucid documentation](https://lucid.adonisjs.com/docs/introduction)
