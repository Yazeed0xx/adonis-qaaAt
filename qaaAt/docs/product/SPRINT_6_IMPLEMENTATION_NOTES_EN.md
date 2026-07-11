# Sprint 6 implementation notes

Sprint 6 adds a provider-neutral payment boundary and a non-production fake provider. No real PSP, card collection, payout, commission, settlement automation, ZATCA integration, or Sprint 7 work is included.

Payment initiation locks the customer Booking and active payment hold, derives SAR minor units from immutable Quote/Booking snapshots, persists Payment and PaymentAttempt, commits, calls the provider, then records safe checkout data in a second transaction. Checkout URLs and redirects never confirm Bookings.

Only a signature-verified webhook can confirm. Its transaction locks Payment, PaymentAttempt, Booking, and hold; validates amount/currency; promotes the existing hold-backed inventory block to its Booking source without an availability gap; converts the hold; marks Payment paid; confirms Booking; snapshots receipt data; audits; and writes durable notifications. Duplicate terminal events are idempotent. Wrong amount/currency, unknown references, and late success create reconciliation records and do not confirm inventory.

The HTTP webhook verifies the exact UTF-8 bytes retained by Adonis `request.raw()` before trusting any field and enforces a 64 KB endpoint limit. Signed events are strictly validated for bounded identifiers, canonical minor units, event/status consistency, timestamps, references, and currency format. Events arriving before provider-reference registration remain durably replayable and are claimed automatically after registration. Webhook outcomes are terminally recorded as `processed`, `reconciliation_required`, `ignored`, `rejected`, or duplicate acknowledgement without overwriting earlier reconciliation results.

All money uses bounded bigint minor units and canonical decimal strings. `deposit` and `full_payment` are the only purposes. Deposit success confirms the Booking while preserving exact remaining balance; it is not represented as full payment and Sprint 6 does not collect the remainder automatically.

Cancellation policies are tenant-scoped immutable versions with bounded, non-overlapping minimum-hours/refund-percent tiers and an explicit non-refundable-deposit flag. The active version is snapshotted before payment. Customer cancellation evaluates that snapshot; provider cancellation is explicitly full-refundable. Cancellation releases inventory once and creates an idempotent Refund intent. Provider I/O happens after commit; only trusted refund events finalize states.

Refund webhooks validate the intended amount, SAR currency, provider reference, event/status pairing, transition eligibility, and bounded cumulative refunded total while holding Refund and Payment locks. Refundable and zero-refund cancellations share durable actor-scoped idempotency. Database composite ownership constraints and transition triggers prevent cross-tenant financial rows and terminal-state regression.

Receipt cores are immutable and include customer/provider display snapshots, safe Commercial Registration, localized Space/Venue snapshots, accepted Quote/revision and line items, VAT display policy and totals, payment purpose, paid/remaining amounts, payment timestamp, cancellation policy, and a separately maintained refund total/status. They contain no customer email, provider secrets, or cardholder data.

`PAYMENT_DRIVER=fake` requires `FAKE_PAYMENT_WEBHOOK_SECRET`, is allowed only in development/test, and its webhook route is absent in production. Fake events use the same raw-body HMAC workflow as a future adapter. There is no unrestricted mark-paid endpoint.

A real Saudi PSP, production payment methods and event mapping, legal invoice/ZATCA requirements, payouts, commissions, settlements, and remaining-balance collection remain unresolved. Receipt snapshots explicitly do not claim ZATCA compliance.

Stable errors include `BOOKING_NOT_PAYABLE`, `PAYMENT_ALREADY_COMPLETED`, `PAYMENT_ATTEMPT_ACTIVE`, `PAYMENT_IDEMPOTENCY_CONFLICT`, `PAYMENT_HOLD_EXPIRED`, `PAYMENT_SIGNATURE_INVALID`, `PAYMENT_PROVIDER_UNAVAILABLE`, `PAYMENT_PROVIDER_OUTCOME_UNKNOWN`, `REFUND_NOT_ALLOWED`, `CANCELLATION_POLICY_REQUIRED`, and `CANCELLATION_NOT_ALLOWED`.

## Webhook replay and financial lock order

Verified webhook events that cannot yet be correlated remain durable with the `received` outcome. A bounded scheduled replay job claims at most 20 events using `FOR UPDATE SKIP LOCKED`, records attempt metadata, and reuses the authoritative webhook transaction. Inline replay after PSP references are stored is only a latency optimization. Events still unmatched after five attempts or 15 minutes become `reconciliation_required` with `unknown_provider_reference`.

Provider adapters may return a validated `internalCorrelationReference` echoed from trusted PSP metadata. The payment domain does not parse provider-specific reference prefixes. Without trusted correlation, replay matches the provider payment or attempt reference after it becomes available.

Financial transactions use this canonical lock order: Booking, Payment, PaymentAttempt, BookingHold, InventoryBlock, Refund, then RefundAttempt where applicable. PostgreSQL deadlock or serialization failures are allowed to roll back the entire webhook claim and are retried by the replay job; a verified event is never marked processed before its domain transaction commits.

Cancellation idempotency is serialized with a transaction-scoped advisory lock derived from actor scope, actor user, and idempotency key before the durable idempotency row is read.

## Refund attempts and early Refund webhooks

`refunds` remains authoritative. Every initial provider request and retry commits a `refund_attempts` row before PSP I/O, including its internal reference, Refund ownership, provider, idempotency fingerprint, exact amount/currency snapshot, safe failure state, and timestamps. PSP I/O stays outside database transactions. Retrying creates attempt history for the same Refund and never creates another Refund.

Trusted Refund events may carry the provider-neutral `internalCorrelationReference`, matched against `refunds.reference`. When the Refund exists but its provider reference is not committed, the event remains `received` without financial mutation or reconciliation. Provider-reference persistence triggers bounded inline replay; the scheduled `FOR UPDATE SKIP LOCKED` worker recovers process crashes. Permanently unmatched events use the existing five-attempt/15-minute `unknown_provider_reference` threshold.

Company retry is `POST /api/companies/refunds/:id/retry`, requires effective `refunds.approve`, and is tenant scoped. `GET /api/users/refunds/:id` returns only the owning customer's Refund and bounded safe attempt history. Admin finance remains read-only.
