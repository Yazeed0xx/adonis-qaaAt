# QaaAt Backend MVP — Implementation Handoff for the Backend Agent

> This document is the approved implementation brief for the backend MVP. Inspect the repository before changing it. Treat `start/routes.ts`, migrations, models, controllers, services, middleware, transformers, and tests as the source of truth. The similarly named API documents in the root of `docs/` are legacy references; the current mobile handoffs live under `docs/mobile/` and must be updated whenever an API contract changes.

## 1. Product objective

QaaAt is a Saudi marketplace for discovering and booking rentable spaces. Wedding halls and private-event venues remain the primary product identity, but the MVP must genuinely support:

- Wedding halls.
- Private-event venues.
- Meeting rooms.
- Training rooms.
- Workshop rooms.
- Seminar and conference spaces.
- Graduation venues.
- Exhibition spaces.
- Multipurpose spaces.

The commercial MVP must allow the following end-to-end outcome:

1. A company registers, submits its legal documents, and waits for approval.
2. After approval, the owner can invite employees with separate accounts and permissions.
3. The company creates venues and bookable spaces, pricing, packages, and availability.
4. The company records reservations received outside QaaAt so the platform does not sell unavailable inventory.
5. A customer searches for a space and submits either a booking request or a request for quotation.
6. The provider confirms availability or submits a quote.
7. The customer receives a short inventory hold and pays either the full amount or a deposit.
8. The booking becomes confirmed, with a clear cancellation/refund policy and complete audit history.

## 2. Non-negotiable product and engineering rules

- Do not model every category as an hourly hall booking.
- Do not enable unrestricted instant booking at launch. Include `instant_book` in the design behind a platform-controlled feature gate only.
- Do not charge the customer in a `request_to_book` flow before the provider confirms availability.
- Do not allow an unpaid request to block inventory for seven days.
- Do not treat `is_available` as availability truth. Availability is temporal and depends on rules, confirmed bookings, external reservations, closures, buffers, and holds.
- Do not trust client-supplied ownership, company IDs, roles, permissions, totals, taxes, discounts, payment statuses, or state transitions.
- Do not hard-delete bookings, quotes, payments, refunds, or other commercial records. Use explicit states and audit events.
- The application/domain layer that owns a multi-write invariant owns its transaction.
- Do not perform remote email, push, malware-scanner, or PSP I/O before a transaction commits. Use the existing outbox/queue pattern where atomic delivery intent matters.
- Every company-owned resource query must be tenant-scoped in the database query itself. A permission check alone is insufficient.
- Preserve both mobile applications during migration. Introduce new contracts with compatibility and an explicit deprecation path.
- Keep the backend as a modular monolith using AdonisJS v7 and PostgreSQL. Do not introduce microservices.

## 3. Existing implementation that must be preserved

The current backend already has valuable foundations:

- AdonisJS v7, TypeScript, PostgreSQL, Lucid, and VineJS.
- Bearer access tokens for native mobile clients.
- Current account types: `user`, `company`, and `admin`.
- Company registration with a commercial-registration PDF.
- PDF signature, structure, size, and malware checks with private storage.
- Company states: `pending`, `approved`, `rejected`, and `suspended`.
- Existing hall CRUD and public discovery.
- Booking request, accept, reject, cancel, and expiry behavior.
- PostgreSQL advisory transaction locks around conflicting booking creation.
- Row locks around competing accept/reject decisions.
- Notification outbox, queues, email, and Expo push delivery.
- Booking and admin audit logs.
- Rate limiting, access-token expiration, and token revocation.
- Transformers and a partially standardized error contract.
- Japa unit and functional tests. The latest verified baseline was 54 passing tests.

Do not weaken any of these protections. Add regression coverage for every changed behavior.

## 4. Current constraints the migration must account for

1. `companies.user_id` is unique and represents the only user attached to a company.
2. `CompanyAuthController` assumes a company-app account has `userType = company` and a direct Company relation.
3. Company middleware, approved-company middleware, `HallService`, `CompanyBookingController`, and push eligibility rely on direct user-to-company lookup.
4. Company notifications currently target `company.user.id` only.
5. `halls` combines the physical venue and bookable unit in one record.
6. Hall amenities are weakly typed, and Hall service strings coexist with a separate priced Service catalog.
7. `pricing` is assumed to be an hourly rate.
8. Availability is hard-coded to 08:00–22:00 in two-hour slots and currently performs a query per slot.
9. `pending` requests block availability for as long as seven days.
10. `payment_status`, `payment_due_date`, and `confirmed` exist without a real payment workflow.
11. Multiple success/error response shapes remain.
12. Root-level API documentation is duplicated and has drifted from the code.

## 5. MVP scope

### Included

- Company memberships, employee invitations, and simple RBAC.
- Venue, Space, and controlled space categories.
- Space moderation and publication lifecycle.
- Real availability, external reservations, closures, buffers, and expiring holds.
- `request_to_book` and `quote_required` flows.
- Visits/viewings for categories that require them.
- Hourly, fixed-session, half-day, full-day, package, and custom-quote pricing.
- Services, packages, and immutable quote/booking line-item snapshots.
- Full payment or deposit, signed webhooks, refunds, and cancellation policies.
- Permission-aware company notifications.
- Complete audit trails for sensitive operations.
- Category-aware search and date/time availability filters.
- Required contracts for the customer app, company app, and minimum admin operation.

### Excluded

- Paid advertising.
- Dynamic pricing.
- AI features.
- Loyalty programs.
- Fully customizable role builders.
- Departments, teams, and complex approval chains.
- Google/Outlook/PMS calendar integrations before the internal calendar is stable.
- Advanced provider subscriptions.
- Microservices or a dedicated search engine without measured need.

## 6. Approved booking modes

### 6.1 `request_to_book`

Default for meeting rooms, training rooms, workshops, and other short-duration inventory.

```text
draft
→ awaiting_provider
→ approved_awaiting_payment
→ confirmed
→ completed
```

Terminal and failure paths:

```text
awaiting_provider → rejected | provider_response_expired | cancelled
approved_awaiting_payment → payment_expired | cancelled
confirmed → cancelled | partially_refunded | refunded
```

Rules:

- The initial request must not block inventory for an extended period.
- Provider approval creates a short, expiring payment hold.
- A client redirect must never confirm payment or booking. Confirmation must come from a verified PSP webhook or equivalent trusted server-side confirmation.

### 6.2 `quote_required`

Default for wedding halls, graduations, exhibitions, major conferences, and complex events.

```text
date_inquiry
→ optional_visit
→ requirements_collected
→ quote_sent
→ quote_accepted
→ payment_hold
→ deposit_paid
→ confirmed
→ completed
```

Rules:

- A date inquiry does not reserve inventory.
- A quote has an expiry and an immutable snapshot of its line items and policy.
- Accepting a quote creates a short hold, commonly 24–48 hours according to the provider/category policy.
- A successful deposit confirms the booking and blocks inventory.
- The MVP may track a deposit and remaining balance. Do not build a general installment engine.

### 6.3 `instant_book`

- Include it in enums/schema or behind a feature flag.
- Providers cannot enable it themselves at launch.
- Future enablement requires platform approval, reliable calendar usage, and a low conflict rate.

## 7. Company memberships, invitations, and RBAC

### 7.1 Approved user experience

- The company app serves both owners and employees.
- QaaAt uses one shared person identity across the customer app and company app. A person who already registered through the customer app is an existing User when later invited as a company employee.
- Sharing an identity does not share authorization. Customer access and company access are separate contexts with separate access tokens.
- A customer-app token must never authorize company routes, and a company-app token must never be accepted as a customer-app token merely because both belong to the same User.
- Company access requires an active CompanyMembership; an existing customer account without a membership cannot sign in to the company app.
- A company initially registers through one owner account and waits for platform approval.
- Once approved, the owner enters an employee name, phone or email, and role.
- The backend creates a pending invitation only. It must not create a fake User or active membership.
- The employee receives a Universal Link/Deep Link.
- If no account exists, the employee verifies the invited contact method, sets a password, reviews the role, accepts, and then the backend creates the User and Membership in one transaction.
- If an account already exists, the employee signs in, proves that the invitation matches that account, and accepts without creating a duplicate account.
- Removing an employee revokes company access but does not delete the identity or historical audit attribution.

### 7.1.1 Shared identity and separate application sessions

The approved identity model is:

```text
User identity
├── customer-app capability/session
└── zero or more CompanyMemberships and company-app sessions
```

Requirements:

- Phone and email remain normalized identities on the shared User record.
- An employee invited using a phone/email already attached to a customer User must reuse that User after authenticating; never create a second account for the same normalized identity.
- A new employee verifies the invited phone/email and sets a password during invitation acceptance.
- An existing User signs in using the current password. An invitation must never reset or replace an existing password.
- A forgotten password uses the standard recovery flow, not invitation acceptance.
- Access tokens must carry or resolve a trusted client context such as `customer_app` or `company_app`. Do not trust a client-supplied header alone; persist the context with the token or issue tokens through distinct guards/providers proven against the installed auth package.
- Company-app authentication additionally requires at least one active membership, except for the existing owner registration/approval restoration flow during compatibility migration.
- Revoking one CompanyMembership terminates access to that company and the relevant company-app sessions according to the documented session policy, but does not revoke customer-app sessions or personal bookings.
- Push installations must be scoped by application/client context so customer and company notifications do not cross applications.
- Keep `users.user_type` temporarily for compatibility, but do not use it as the authorization source for newly invited employees. A User may retain `userType = user` and still access the company app through an active membership.

### 7.2 Role presets

Use code-defined presets:

```text
owner
manager
booking_staff
calendar_staff
accountant
viewer
```

Do not build custom roles in the MVP. Limited per-member overrides may be supported.

### 7.3 Initial permissions

Start with understandable capability groups:

```text
spaces.view
spaces.manage
calendar.view
calendar.manage
booking_requests.view
booking_requests.manage
bookings.view
bookings.manage
quotes.view
quotes.manage
visits.view
visits.manage
finance.view
refunds.request
refunds.approve
members.view
members.manage
company.view
company.manage
payout_settings.manage
```

Rules:

- `owner` receives all business permissions but remains subject to platform invariants.
- The last active owner cannot be removed or demoted.
- Ownership transfer is not required in Sprint 1. If added later, require reauthentication/OTP and a transaction.
- Payout changes and sensitive financial permission changes require reauthentication and owner notification when the finance phase is implemented.
- If permission overrides are implemented, support `allow` and `deny`, with `deny` taking precedence.

### 7.4 Proposed schema

```text
company_memberships
- id
- company_id FK
- user_id FK
- role
- status: active | suspended | revoked
- invited_by_user_id nullable FK
- joined_at
- created_at
- updated_at
- unique(company_id, user_id)
- index(company_id, status)
- index(user_id, status)
```

```text
company_invitations
- id
- company_id FK
- name
- invited_phone nullable
- invited_email nullable
- role
- permission_overrides nullable, only if needed
- token_hash unique
- status: pending | accepted | expired | cancelled
- invited_by_user_id FK
- accepted_by_user_id nullable FK
- expires_at
- accepted_at nullable
- cancelled_at nullable
- created_at
- updated_at
```

Require at least one invitation contact method. Normalize phone/email before uniqueness checks and enforce important invariants in the database, not only VineJS.

```text
company_membership_permissions
- id
- company_membership_id FK
- permission
- effect: allow | deny
- unique(company_membership_id, permission)
```

### 7.5 Invitation acceptance invariant

Perform acceptance in one transaction:

1. Lock the invitation using `FOR UPDATE`.
2. Require `pending`, not expired, and not cancelled.
3. Require an approved, active, non-deleted company.
4. Require proof of ownership of the invited email/phone.
5. Find an existing User using the normalized identity; do not duplicate it.
6. Create a User only if none exists and identity/password checks have succeeded.
7. Create one Membership or return a stable conflict response.
8. Mark the invitation accepted and record actor/timestamps.
9. Write an audit event.
10. Issue the access token after commit, never before it.

For an existing User, invitation acceptance must require normal authentication or an equally strong reauthentication flow. Possession of the invitation token alone is not permission to change the User password or take over the account.

### 7.6 Compatibility with the current model

- Do not remove `companies.user_id` in Sprint 1.
- Backfill an active `owner` Membership for every existing company.
- Treat `companies.user_id` as a temporary legacy owner pointer.
- Migrate middleware, controllers, and services incrementally to membership context.
- Update company login to return memberships, role, and permissions while temporarily preserving fields needed by the current company app.
- Evolve company login so an existing customer User with an active CompanyMembership can authenticate in the company app even when `userType = user`.
- Introduce explicit token/application context without breaking existing issued tokens abruptly. Document migration and revocation behavior for legacy tokens.
- Audit push registration and company notifications; they must eventually support eligible employees rather than only `company.user.id`.
- Do not alter customer-app authentication during the RBAC sprint.

### 7.7 Initial API surface

Authenticated company context:

```http
GET    /api/companies/members
POST   /api/companies/invitations
GET    /api/companies/invitations
POST   /api/companies/invitations/:id/resend
DELETE /api/companies/invitations/:id
PATCH  /api/companies/members/:id
DELETE /api/companies/members/:id
```

Public/auth-assisted invitation acceptance:

```http
GET  /api/company-invitations/inspect?token=...
POST /api/company-invitations/accept
```

The inspection response must never expose token hashes, full phone/email values, legal documents, or sensitive company data.

### 7.8 Mandatory security tests

- Company A cannot read or mutate Company B memberships or invitations.
- A member without `members.manage` cannot invite or modify employees.
- Expired, cancelled, and previously accepted invitations are rejected.
- Concurrent acceptance creates at most one Membership.
- A mismatched phone/email identity is rejected.
- An existing User is reused and not duplicated.
- A customer User with a valid membership can sign in to the company app, while the same User without a membership is rejected.
- A customer-app token cannot call company routes, and a company-app token cannot call customer routes.
- Accepting an invitation for an existing User never changes that User password.
- The last active owner cannot be removed.
- Revoking/suspending membership removes access on the next request and applies the documented token/session policy.
- Role, permission, invitation, and revocation changes generate audit events.

## 8. Venue and Space target model

### 8.1 Separation

```text
Company → Venue → Space
```

- `Venue` is a branch or physical site with shared address/location details.
- `Space` is an independently bookable unit inside a venue.

A hotel may therefore have one Venue with several meeting rooms and wedding halls.

### 8.2 Controlled categories

Use platform-managed slugs:

```text
wedding_hall
private_event_venue
meeting_room
training_room
workshop_room
seminar_space
conference_space
graduation_venue
exhibition_space
multipurpose_space
```

A Space has one primary category and may have multiple suitability/use tags. Do not duplicate one physical space into several listings only to represent use cases.

### 8.3 Core schema direction

`venues` should include:

- company ownership.
- Arabic/English naming or an explicit translation strategy.
- normalized Saudi address fields: city, district, street, building number, postal code, additional number.
- latitude/longitude.
- access instructions and parking metadata.
- verification/publication state.
- timestamps and soft deletion.

`spaces` should include:

- Venue relation and clear company ownership/scoping.
- category.
- name and description.
- booking mode.
- pricing mode/default rate reference.
- publication state: `draft | pending_review | published | suspended | archived`.
- common capacities.
- `requires_visit`.
- duration/notice rules where applicable.
- timestamps and soft deletion.

Normalize fields used in search and filtering:

```text
amenity_definitions
space_amenities
space_media
```

Validated category metadata is acceptable for rare category-specific attributes, but do not use unrestricted `any` for data affecting search, price, availability, permissions, or security.

### 8.4 Category-specific data

Wedding halls may require male/female section capacities where relevant, entrances, bridal room, stage/kosha, hospitality, parking, packages, and visit support.

Meeting/training spaces may require seating layouts and capacities, projector/display, video conferencing, internet, whiteboard, soundproofing, and equipment.

Exhibition/conference spaces may require floor area, ceiling height, loading access, power requirements, setup/teardown windows, and visitor capacity.

### 8.5 Hall migration

- Do not break `/api/halls` without a compatibility period.
- Create a deliberate migration/backfill or compatibility adapter from Hall to Venue/Space.
- Preserve historical Booking relations.
- Never edit generated `database/schema.ts` manually; change migrations/models and regenerate through project tooling.
- Add contract tests for legacy and new endpoints during migration.

## 9. Availability and external reservations

### 9.1 Target tables

```text
availability_rules
availability_exceptions
external_reservations
booking_holds
```

### 9.2 Functional requirements

- Weekly operating hours per Space.
- Flexible windows rather than hard-coded 08:00–22:00 two-hour slots.
- Morning/evening/full-day sessions for event halls.
- Hourly and minimum-duration rules for meeting/training spaces.
- Multi-day booking plus setup/teardown windows for exhibitions.
- Closures, maintenance, and blackout exceptions.
- Preparation/cleanup buffers.
- Minimum notice and maximum advance-booking window.
- Explicit timezone interpretation. Document how local venue time is converted and stored.

### 9.3 External reservations

The company app must support a fast operation containing only:

```text
space + start/end + type + optional internal note
```

Types:

```text
external_confirmed
external_hold
maintenance
closure
internal_event
```

Do not require external customer details or price in the MVP.

### 9.4 Holds and overlap invariants

- Inquiries and pre-approval requests do not create long inventory blocks.
- Payment holds have `expires_at` and are released automatically.
- Only defined blocking states participate in overlap constraints.
- Preserve existing transaction locking, but add a database-level invariant, preferably a PostgreSQL range/exclusion constraint if compatible with the chosen temporal representation.
- Test races among QaaAt bookings, external reservations, holds, quote acceptance, and hold expiry.
- Fetch blocking intervals in one query and calculate availability efficiently. Do not issue one database query per generated slot.

## 10. Pricing, packages, and snapshots

### 10.1 Pricing modes

```text
hourly
fixed_session
half_day
full_day
package
custom_quote
```

### 10.2 Model direction

Prefer cohesive concepts such as:

```text
rate_plans
price_rules, only when a real rule is required
service_options
space_service_options
packages
package_items
```

Do not build a dynamic pricing engine. The MVP needs understandable base time/session/package prices.

### 10.3 Quote and booking snapshots

Every quote/booking requires server-generated line items:

```text
description
type
quantity
unit_price
subtotal
discount
vat_rate
vat_amount
total
currency = SAR
```

Also snapshot:

- whether displayed prices include VAT.
- platform fee/commission after the commercial model is approved.
- provider net.
- cancellation-policy version/content.
- quote expiry.
- required deposit and remaining balance.

Never recompute a historical booking from current provider prices.

## 11. Visits and quotations

`visits` must support:

- Customer request.
- Provider approval, rejection, or proposed alternative time.
- `scheduled | cancelled | completed | no_show`.
- Notifications to both parties.
- Actor audit.
- Optional relation to inquiry and quote.

`quotes` must support:

- `draft | sent | accepted | rejected | expired | withdrawn`.
- Simple revision behavior. Do not mutate what the customer already received; create a new revision.
- Line items, expiry, and policy snapshot.
- The member who created/sent the quote.
- Race-safe acceptance that creates only one hold.

## 12. Payments and refunds

Do not begin PSP integration before the provider and regulatory/commercial model are approved. Still, maintain a clear boundary around:

```text
payments
payment_attempts
refunds
provider_settlements or reconciliation records, according to the PSP model
```

Mandatory requirements:

- Server-generated amounts only.
- Idempotency keys protected by database uniqueness.
- Signed webhook verification.
- Webhook event deduplication.
- Separate booking and payment states.
- Never confirm from a success redirect.
- Full and partial refunds.
- Expiry jobs for payment windows and holds.
- Complete audit and reconciliation history.
- Never store sensitive card data.
- Mada and Apple Pay through the PSP where available.

### 12.1 Approved temporary payment simulation

No real PSP has been selected yet. Development must therefore use a provider abstraction and a fake implementation rather than postponing the booking/payment state design.

Define a cohesive boundary similar to:

```ts
interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<PaymentSession>
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus>
  refund(input: RefundPaymentInput): Promise<RefundResult>
  verifyWebhook(request: WebhookRequest): Promise<VerifiedPaymentEvent>
}
```

Implement `FakePaymentProvider` for development and automated tests. A future PSP adapter must replace only the provider integration, not booking, quote, hold, payment, refund, or audit state machines.

Fake-provider requirements:

- Configure it through typed configuration, for example `PAYMENT_DRIVER=fake`, validated in `start/env.ts`/`config/*`.
- The application must fail closed if `PAYMENT_DRIVER=fake` is selected in production.
- Simulation routes must not be registered at all in production.
- Never add a general production-capable `mark-paid` endpoint.
- A development-only simulation endpoint or UI may produce success, failure, cancellation, expiry, full refund, and partial refund events.
- Simulated events must pass through the same idempotent event-processing/application workflow used by future verified webhooks.
- Tests may invoke the fake provider directly through dependency injection; they must not depend on unsafe public routes.
- Persist realistic payment attempts, event IDs, idempotency keys, amounts, currency, and transitions so the real adapter can be added without schema redesign.
- Fake payment support is scheduled for the payment sprint, not Sprint 1.

## 13. Notifications after memberships

Company operational notifications must not automatically target only the owner or every member:

- Select active members who hold the relevant permission.
- Initially, booking notifications may target owner, manager, and booking staff.
- Calendar alerts may target owner, manager, and calendar staff.
- Leave a clean path for member notification preferences, but they are not required in Sprint 1.
- Enqueue notification intent inside the transaction using the existing outbox pattern; deliver after commit.

## 14. Admin operation

The MVP needs minimum admin APIs/UI for:

- Company and legal-document review.
- Space review, publication, and suspension.
- Category and amenity management.
- Booking, quote, payment, and refund visibility.
- Refund/dispute workflows.
- Audit-log access.
- State-based operational intervention without hard-deleting commercial records.

Do not expand admin RBAC in Sprint 1 unless required to operate the new feature safely.

## 15. API contracts

- Standardize success and error envelopes incrementally.
- Use Transformers for public resources; do not return raw Lucid models.
- Preload every relation promised by a Transformer.
- Validate body, route params, and query params.
- Validate status/category/sort as enums; do not pass unchecked strings into query conditions.
- Preserve camelCase responses and document temporary legacy exceptions.
- Update generated OpenAPI and both canonical mobile documents whenever contracts change.

## 16. Required implementation sequence

Do not implement the entire MVP in one pull request.

### Sprint 0 — Product specification and state contracts

- Finalize product, state, and permission specifications.
- Define transitions for inquiry, request, quote, hold, booking, payment, and refund.
- Record unresolved decisions. Do not invent PSP, commission, or VAT ownership behavior.

### Sprint 1 — Company memberships and invitations

- Migrations and owner backfill.
- Models and relationships.
- Permission constants and role presets.
- Membership/permission request context and tenant scoping.
- Invitation create, inspect, accept, resend, and cancel.
- Member list, update, suspend/revoke.
- Backward-compatible company login response plus memberships.
- Shared-identity company login for invited existing customer Users.
- Explicit separation of customer-app and company-app tokens/sessions, including regression coverage for cross-app token rejection.
- Invitation email/message.
- Audit events.
- OpenAPI and mobile docs.
- Complete functional/security tests.

**Do not begin Venue/Space implementation before Sprint 1 is complete and reviewed.**

### Sprint 2 — Venue, Space, and moderation

- Schema, categories, amenities, media, and publication lifecycle.
- Hall migration/compatibility.
- Permission-aware company CRUD.
- Admin moderation.
- Public reads and category-aware filters.

### Sprint 3 — Availability and external reservations

- Rules, exceptions, external blocks, and holds.
- Company calendar APIs.
- Public availability.
- Overlap/concurrency invariants and expiry jobs.

### Sprint 4 — Requests, inquiries, and visits

- `request_to_book`.
- Date inquiry.
- Visits.
- Configurable response expiries by mode/category.
- Notifications and audit.

### Sprint 5 — Pricing, packages, services, and quotes

- Rate plans, packages, and options.
- Quote line items and revisions.
- Quote accept/reject/expire.
- Payment hold creation.

### Sprint 6 — Payments and refunds

- `PaymentProvider` integration boundary and non-production `FakePaymentProvider`.
- Payment attempts, webhooks, and idempotency.
- Deposit and full payment.
- Cancellation/refund policy execution.
- Reconciliation and invoice data.

### Sprint 7 — Launch hardening

- Complete OpenAPI and mobile handoffs.
- Production storage, queue, and limiter configuration.
- Metrics, logs, alerts, backups, and restore testing.
- PDPL retention, export, correction, and deletion procedures.
- Pilot readiness.

## 17. First vertical slices after the foundations

### Meeting-room slice

```text
company creates meeting room
→ defines working hours and hourly rate
→ adds an external reservation
→ customer searches date/time
→ external interval is unavailable
→ customer submits request
→ authorized employee accepts
→ payment hold is created
→ verified payment webhook confirms booking
```

### Wedding-hall slice

```text
company creates wedding hall and package
→ defines evening/day availability
→ blocks an externally booked date
→ customer submits date inquiry and requirements
→ optional visit
→ authorized employee sends quote
→ customer accepts
→ 24–48 hour hold
→ deposit webhook confirms booking
→ remaining balance is tracked
```

Do not assume the shared engine fits all categories until both slices work. Together they exercise the two main temporal and commercial extremes.

## 18. Definition of Done for every feature

A feature is not complete without:

1. Migration with constraints, indexes, and a considered rollback.
2. Models, relationships, and appropriate scopes.
3. Validators for body, params, and query input.
4. Authorization plus tenant-scoped resource queries.
5. A cohesive application/domain workflow and transaction ownership.
6. Thin controller and ordered routes.
7. Transformer and stable success/error contract.
8. Outbox/job for reliable side effects where needed.
9. Unit tests for pure rules.
10. Functional API tests for success, failure, ownership, and permissions.
11. Concurrency tests where state can race.
12. Updated OpenAPI and handoff documentation.
13. Passing verification gates.

## 19. Verification gates and database safety

Before running any database test command:

- Prove that `.env.test` targets PostgreSQL, Redis/queue, cache, and storage resources isolated from development and production.
- Never run `migration:fresh`, rollback, destructive truncation, or cleanup until that isolation is verified.

Use the repository's current scripts:

```bash
node ace list:routes
npm run typecheck
npm run lint
npm test
npm run build
```

Sprint 1 must include a focused membership/invitation suite before the complete suite.

## 20. Engineering instructions for the agent

- Read `CLAUDE.md`, but do not trust its AdonisJS 6 statement. `package.json` and the installed code prove that this project uses AdonisJS v7. Correct that document when in scope.
- Follow APIs and types from the installed AdonisJS v7 packages. Do not guess from older versions.
- Use current VineJS validation and `request.validateUsing()` conventions.
- Use container injection for new controllers/services instead of repeatedly calling `new Service()`.
- Never manually edit generated `.adonisjs` files or `database/schema.ts`.
- Do not introduce NestJS-style repositories, modules, or DTO ceremony.
- Never trust client-supplied tenant, role, permission, status, total, or ownership fields.
- Keep remote I/O outside database transactions while recording reliable outbox intent inside the transaction.
- Preserve unrelated user changes in the worktree.
- If an unresolved business decision changes the API or financial invariant, document it and request a decision instead of inventing behavior.

## 21. Immediate assignment

Start with Sprint 1 only. Before editing, provide a concise implementation preflight containing:

1. Current files and relationships that will be affected.
2. Migration and owner-backfill strategy.
3. Backward-compatibility strategy for the existing company app.
4. Proposed invitation and membership API contract.
5. Role/permission presets.
6. Shared-identity and separate-token migration strategy.
7. Test matrix.

Then implement Sprint 1 completely, verify it, update OpenAPI and canonical documentation, and provide a handoff containing:

- Changed files.
- Decisions made.
- Verification results.
- Any unresolved decision that blocks Sprint 2.

Do not automatically proceed to Sprint 2 in the same change. Sprint 1 contracts and migration results must be reviewed first.
