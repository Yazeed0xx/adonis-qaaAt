# Sprint 4 requests, date inquiries, and visits

- `bookings` remains the only booking-request aggregate and state machine. `pending` is submitted/awaiting-provider and `accepted` is approved/awaiting-payment. Space-only rows use `space_id` with nullable `hall_id`; no fake Hall is created.
- Legacy Hall writes are projected into the same tenant/Space snapshot through a compatibility trigger and application service. Existing Hall endpoints remain registered.
- Space request submission validates the published request-to-book Space and authoritative Sprint 3 policy but creates no hold/block. Provider approval locks the Booking, revalidates policy and Space state, creates the existing payment hold/block, transitions state, audits, and enqueues notifications atomically.
- Date inquiries are non-blocking and intentionally stop before quotes. Sprint 5 owns price/rate/package/service/quote line items, revisions, acceptance, VAT, and quote holds.
- Visits are separate appointments. Confirmed visits are conflict-checked at Venue level and never enter the rentable-space inventory ledger.
- Provider answers remain durably readable through bounded inquiry-message pagination. This is structured asynchronous communication, not real-time chat.
- A changed visit interval creates `alternative_proposed`; customer acceptance rechecks Venue conflicts and alone transitions it to `confirmed`. Provider response expiry applies only to `submitted` visits.
- Direct confirmation and alternative proposals require a future start and an end after the start. Alternative acceptance revalidates the same temporal rules and returns `422 REQUEST_TIME_INVALID` without changing the proposal when it has elapsed.
- Company notification intents fan out to deduplicated active members with the effective resource view permission, honoring role presets and membership overrides. Company inquiry/visit contracts consistently redact direct customer email.
- Category defaults plus optional Space overrides configure booking, inquiry, and visit response expiries. Expiry workers use bounded `FOR UPDATE SKIP LOCKED` claims and retain audit history.
- All new create operations use customer-scoped idempotency keys. Tenant queries include `company_id`; customer queries include `user_id`; company actions require Sprint 1 permissions.
- Rollback is allowed before Space-only Booking usage and fails with an actionable report afterward rather than deleting records or inventing Hall relationships.
- Sprint 5 payments, pricing, quotes, packages, services, reviews, advertisements, payouts, refunds, invoices, commissions, and instant booking are excluded.
