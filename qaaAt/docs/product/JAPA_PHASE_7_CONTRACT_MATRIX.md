# Japa Phase 7 Contract Matrix

## Authority and scope

This matrix assigns payment, webhook, cancellation, refund, receipt, and reconciliation contracts
from `BACKEND_MVP_IMPLEMENTATION_HANDOFF_EN.md` to one canonical Japa layer. Functional tests use the
real HTTP/auth/validation boundary. Provider adapters, webhook processors, workers, PostgreSQL
constraints, rollback, and races use committed disposable-database integration tests.

## Customer and finance HTTP contracts

| Contract                                                                  | Canonical test                                                   | Durable proof                                                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Payable summary uses authoritative booking/quote money                    | `tests/functional/payments/customer.spec.ts`                     | Exact string minor units and payment purpose                                   |
| Payment initiation validates input and is idempotent                      | `tests/functional/payments/customer.spec.ts`                     | Same reference and one payment/attempt                                         |
| Payment list/detail/receipt are customer-owned                            | `tests/functional/payments/customer.spec.ts`                     | Owned 200 and outsider 404                                                     |
| Customer paid cancellation creates an owned refund and releases inventory | `tests/functional/payments/customer.spec.ts`                     | Exact refund, cancelled booking, released block                                |
| Company policy creation versions and activates policies                   | `tests/functional/payments/company.spec.ts`                      | Ordered versions and one active policy                                         |
| Provider cancellation refunds the authoritative full payment              | `tests/functional/payments/company.spec.ts`                      | Exact unsafe-integer refund amount                                             |
| Company finance lists are tenant scoped                                   | `tests/functional/payments/company.spec.ts`                      | One tenant payment despite two fixtures                                        |
| Finance and refund actions honor effective permissions/membership status  | `tests/functional/payments/access.spec.ts` and `refunds.spec.ts` | Allowed, explicit deny, insufficient role, revoked membership                  |
| Admin audit endpoints expose bounded payment metadata                     | `tests/functional/payments/company.spec.ts`                      | Authenticated arrays for payments, attempts, webhooks, refunds, reconciliation |

## Webhooks and payment state

| Contract                                                           | Canonical test                                          | Durable proof                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------ |
| HTTP webhook verifies the exact raw bytes                          | `tests/functional/payments/webhooks.spec.ts`            | Valid signed bytes confirm; one-byte change fails      |
| Missing/invalid signatures and oversized payloads fail safely      | `tests/functional/payments/webhooks.spec.ts`            | Stable 401/413 without confirmation                    |
| Verified success confirms booking and promotes its inventory block | `tests/integration/payments/webhook_processing.spec.ts` | Paid/confirmed state and booking-backed block          |
| Wrong amount/currency and malformed contradictions never confirm   | `tests/integration/payments/webhook_processing.spec.ts` | Reconciliation/failure outcomes and unchanged booking  |
| Duplicate and out-of-order events are idempotent and terminal-safe | `tests/integration/payments/webhook_processing.spec.ts` | One terminal payment; processed event outcomes         |
| Webhook transaction failure rolls back every aggregate             | `tests/integration/payments/webhook_processing.spec.ts` | Payment, booking, hold, and inventory unchanged        |
| Success races expiry/cancellation consistently                     | `tests/integration/payments/cancellations.spec.ts`      | One permitted terminal outcome and coherent final rows |

## Provider, workers, refunds, and constraints

| Contract                                                               | Canonical test                                                           | Durable proof                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| Initiation uses committed intent before provider I/O                   | `tests/integration/payments/initiation.spec.ts`                          | Provider observes payment/attempt rows               |
| Provider failure/timeout is durable and fails closed                   | `tests/integration/payments/initiation.spec.ts`                          | Failed/unknown attempt and active inventory          |
| Concurrent initiation creates one attempt                              | `tests/integration/payments/initiation.spec.ts`                          | One winner and one active commercial attempt         |
| Early webhook replay and background recovery claim events once         | `tests/integration/payments/reconciliation.spec.ts`                      | One processed outcome/audit path                     |
| Bounded unknown events become reconciliation records                   | `tests/integration/payments/reconciliation.spec.ts`                      | Threshold and exact mismatch result                  |
| Refund retries are idempotent and concurrency safe                     | Functional refund retry and `tests/integration/payments/refunds.spec.ts` | One provider attempt per key and one terminal refund |
| Refund success/failure ordering never regresses success                | `tests/integration/payments/refunds.spec.ts`                             | Exact refunded amount and terminal state             |
| Refund amount/currency mismatch requires reconciliation                | `tests/integration/payments/refunds.spec.ts`                             | No false success and exact reconciliation result     |
| Cancellation retries serialize for refundable and zero-refund paths    | `tests/integration/payments/cancellations.spec.ts`                       | One idempotency row/refund and released inventory    |
| Cross-tenant ownership and financial transitions are database enforced | `tests/integration/payments/database_invariants.spec.ts`                 | PostgreSQL FK/check/trigger errors                   |

## Replacement gate

The 1,465-line `tests/functional/payments.spec.ts` is removed. Payment contracts now live in five
focused functional files, six integration files, and one shared scenario builder. Functional tests
use generated named routes except the raw webhook test, where the literal URL is part of the raw-body
transport contract. Integration tests do not start or depend on the HTTP server.
