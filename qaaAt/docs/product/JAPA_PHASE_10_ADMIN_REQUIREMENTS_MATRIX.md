# Japa Phase 10 — Final Handoff Gap Matrix

Status: completed on 2026-07-18.

This phase closes the two repository requirements selected after the final comparison. Sprint 7 operational hardening is intentionally out of scope.

## Requirement ownership

| Handoff requirement                                                                              | Production boundary                                                          | Canonical Japa evidence                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy booking notifications select active members with the effective booking-request permission | `companyNotificationRecipients` and `BookingManagementService.createBooking` | `tests/integration/bookings/creation.spec.ts` proves owner/staff fanout, deny override exclusion, revoked-member exclusion, durable processing, and idempotent consumption                               |
| Admin controls category labels/order/active state while category slugs remain fixed              | `AdminCatalogService`, `AdminCatalogController`                              | `tests/functional/admin/catalog.spec.ts` proves admin auth, fixed-category updates, public-catalog propagation, and absence of arbitrary category creation                                               |
| Admin controls amenity definitions without destructive deletion                                  | `AdminCatalogService`, `AdminCatalogController`                              | `tests/functional/admin/catalog.spec.ts` proves creation, slug uniqueness, update/deactivation, and transactional audit events                                                                           |
| Admin can inspect audit history                                                                  | `AdminAuditLogService`, `AdminAuditLogsController`                           | `tests/functional/admin/audit_logs.spec.ts` proves validation, filters, pagination, and normalized admin/company/booking scopes                                                                          |
| Admin can retry a failed refund without bypassing the provider workflow                          | `AdminPaymentsController.retryRefund`, existing `PaymentService` workflow    | `tests/functional/admin/finance_operations.spec.ts` proves provider-attempt creation and admin audit attribution                                                                                         |
| Admin can operate payment disputes without rewriting commercial state                            | `payment_disputes`, `AdminDisputeService`, `AdminDisputesController`         | Functional finance operations prove auth/state/audit/payment isolation; `tests/integration/payments/disputes.spec.ts` proves one active case under concurrency and terminal-state PostgreSQL enforcement |

## Deliberate boundaries

- Phone invitations remain a future SMS/OTP feature. MVP invitations are verified-email-only.
- Payment disputes are admin/support cases. Neither mobile app receives dispute endpoints.
- A dispute never mutates Booking, Payment, Refund, inventory, or reconciliation state.
- Category slugs are the approved platform list. Admins may update presentation/order/active state but cannot create or delete categories.
- Amenities are deactivated rather than deleted so historical relations remain intact.
- Sprint 7 metrics, alerts, backup/restore, and PDPL operational procedures remain intentionally deferred by the product owner.
