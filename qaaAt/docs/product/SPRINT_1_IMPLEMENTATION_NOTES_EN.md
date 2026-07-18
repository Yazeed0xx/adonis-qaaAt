# Sprint 1 implementation decisions

These decisions narrow the approved MVP handoff until dedicated phone verification and platform ownership-transfer rules are implemented.

## Invitation identity verification

- Sprint 1 invitations require email. Phone-only invitations return validation error `422`.
- SMS delivery and phone-only authentication are not implemented and must not be implied by clients.
- Invitation secrets are random, stored only as SHA-256 hashes, expire, and are delivered only to the invited mailbox through the durable notification outbox.
- Possession of that mailbox-delivered secret proves email control for a genuinely new identity. The server creates the account with the email stored on the locked invitation.
- If that normalized email already belongs to a User, unauthenticated acceptance fails with `INVITATION_AUTHENTICATION_REQUIRED`. The user must authenticate normally.
- Invitation acceptance never writes a password for an existing User.

## Delegation rules

- Only an active owner may invite or promote another owner, modify an owner membership, or grant `payout_settings.manage`.
- A non-owner with `members.manage` may delegate only effective permissions they currently possess.
- Deny overrides remain authoritative when effective permissions are calculated.
- The final active owner cannot be removed, suspended, revoked, or demoted.

## Session revocation

Suspending or revoking a membership removes access tokens containing both `client:company_app` and the affected `company:{id}` ability and revokes active company-app push installations. Customer-app tokens and customer-app push installations remain valid. A User may have only one current (`active` or `suspended`) CompanyMembership.
