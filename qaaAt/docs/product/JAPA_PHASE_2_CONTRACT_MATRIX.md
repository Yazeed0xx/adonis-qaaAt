# Japa Phase 2 Contract Matrix

This matrix maps the approved authentication, company-context, membership, invitation, tenancy, and
RBAC behavior from `BACKEND_MVP_IMPLEMENTATION_HANDOFF_EN.md` to canonical executable tests. A row is
complete only when the named replacement test passes through the stated boundary.

| Contract                      | Canonical boundary | Required proof                                                                                                       |
| ----------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Customer registration         | HTTP               | Exact created envelope, customer token context, persisted unverified identity, duplicate/invalid input rejected      |
| Customer login/session        | HTTP               | Success, invalid credentials, deleted/wrong account type rejected, `me`, logout revokes current token                |
| Email verification            | HTTP               | Correct OTP succeeds, invalid/expired/already-used OTP fails with stable code, token fields cleared                  |
| Company login                 | HTTP               | Legacy owner and invited customer-member succeed, no active membership fails, the single membership scopes the token |
| Client separation             | HTTP               | Customer token cannot call company routes; company token cannot call customer routes                                 |
| Company context compatibility | Integration        | Active membership wins; legacy owner is backfilled only for its owned company; inactive membership is rejected       |
| Member reads                  | HTTP               | Same-tenant list, `members.view` requirement, no cross-tenant disclosure                                             |
| Member mutation               | HTTP               | `members.manage`, tenant scope, role/delegation rules, last-owner invariant, unchanged state on denial               |
| Membership cardinality        | HTTP + database    | At most one active/suspended membership per User; invitations and historical reactivation reject conflicts           |
| Membership session policy     | HTTP + database    | Suspend/revoke removes company tokens and company push access; customer tokens and customer push access survive      |
| Invitation management         | HTTP               | Create/list/resend/cancel, approved-company gate, tenant scope, permission checks, no token/hash disclosure          |
| Existing-user acceptance      | HTTP               | Auth required, invited identity must match, User reused, password unchanged, one Membership and audit event          |
| New-user acceptance           | HTTP               | Invited identity—not client email—creates one User and Membership atomically                                         |
| Invitation terminal states    | HTTP               | Expired, cancelled, and accepted invitations reject reuse with stable status/code                                    |
| Invitation concurrency        | HTTP               | Two simultaneous accepts produce one success and one conflict; one Membership and one acceptance audit event         |
| Auditability                  | HTTP + database    | Invitation create/resend/cancel/accept and membership role/permission/status changes write durable audit rows        |

## Canonical test ownership

- `tests/functional/auth/customer.spec.ts`
- `tests/functional/auth/company.spec.ts`
- `tests/functional/auth/admin.spec.ts`
- `tests/functional/invitations/management.spec.ts`
- `tests/functional/invitations/acceptance.spec.ts`
- `tests/functional/memberships/access.spec.ts`
- `tests/functional/memberships/mutations.spec.ts`
- `tests/integration/company_context/service.spec.ts`

Functional files enter through HTTP only. Direct service behavior and legacy-context compatibility
belong to integration tests. Existing monolithic cases are deleted only after their replacement is
green.
