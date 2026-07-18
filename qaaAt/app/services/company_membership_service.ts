import { createHash, randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import CompanyInvitation from '#models/company_invitation'
import CompanyMembership from '#models/company_membership'
import CompanyMembershipPermission from '#models/company_membership_permission'
import CompanyMembershipException from '#exceptions/company_membership_exception'
import type { CompanyContext } from '#services/company_context_service'
import {
  resolvePermissions,
  type CompanyPermission,
  type CompanyRole,
} from '#lib/company_permissions'
import notificationOutboxService from '#services/notification_outbox_service'
import { CompanyAccessRevocationService } from '#services/company_access_revocation_service'

type Override = { permission: CompanyPermission; effect: 'allow' | 'deny' }

const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || null
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const maskEmail = (email: string | null) =>
  email ? email.replace(/^(.{1,2}).*(@.*)$/, '$1***$2') : null
const maskPhone = (phone: string | null) =>
  phone ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : null

export class CompanyMembershipService {
  private accessRevocation = new CompanyAccessRevocationService()

  async listMembers(context: CompanyContext) {
    return CompanyMembership.query()
      .where('companyId', context.companyId)
      .whereNot('status', 'revoked')
      .preload('user', (query) => query.preload('userProfile'))
      .preload('permissionOverrides')
      .orderBy('id', 'asc')
  }

  async listInvitations(context: CompanyContext) {
    return CompanyInvitation.query()
      .where('companyId', context.companyId)
      .orderBy('createdAt', 'desc')
  }

  async createInvitation(
    context: CompanyContext,
    actorUserId: number,
    input: {
      name: string
      email: string
      role: CompanyRole
      permissionOverrides?: Override[]
    }
  ) {
    this.assertInvitationAllowed(context, input.role, input.permissionOverrides)
    const token = randomBytes(32).toString('base64url')
    const invitation = await db.transaction(async (trx) => {
      const email = normalizeEmail(input.email)
      if (!email)
        throw new CompanyMembershipException(
          'Email is required for invitation delivery',
          'INVITATION_EMAIL_REQUIRED',
          422
        )
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
        `company-membership:${email}`,
      ])
      const existingUser = await User.query({ client: trx })
        .whereRaw('LOWER(email) = ?', [email])
        .first()
      if (existingUser) {
        await this.assertMembershipAvailable(trx, existingUser.id, context.companyId)
        const historicalMembership = await CompanyMembership.query({ client: trx })
          .where('companyId', context.companyId)
          .where('userId', existingUser.id)
          .first()
        if (historicalMembership)
          throw new CompanyMembershipException(
            'This user already has a membership for the company',
            'MEMBERSHIP_ALREADY_EXISTS'
          )
      }
      const duplicate = await CompanyInvitation.query({ client: trx })
        .where('status', 'pending')
        .where('invitedEmail', email)
        .first()
      if (duplicate)
        throw new CompanyMembershipException(
          'A pending invitation already exists for this contact',
          'INVITATION_ALREADY_PENDING'
        )
      const row = await CompanyInvitation.create(
        {
          companyId: context.companyId,
          name: input.name,
          invitedEmail: email,
          invitedPhone: null,
          role: input.role,
          permissionOverrides: input.permissionOverrides ?? null,
          tokenHash: hashToken(token),
          status: 'pending',
          invitedByUserId: actorUserId,
          expiresAt: DateTime.now().plus({ days: 7 }),
        },
        { client: trx }
      )
      await this.audit(
        trx,
        context.companyId,
        actorUserId,
        'invitation.created',
        'company_invitation',
        row.id,
        { role: input.role }
      )
      await notificationOutboxService.enqueue(
        {
          userId: existingUser?.id,
          clientContext: 'company_app',
          companyId: context.companyId,
          recipientEmail: email ?? undefined,
          type: 'company_invitation',
          title: 'Company invitation',
          message: `You have been invited to join a company on QaaAt. Accept using this secure link: /company-invitations/accept?token=${token}`,
          sendEmail: Boolean(email),
          emailSubject: 'You are invited to QaaAt',
        },
        trx
      )
      return row
    })
    return invitation
  }

  async inspect(token: string) {
    const invitation = await CompanyInvitation.query()
      .where('tokenHash', hashToken(token))
      .preload('company', (query) => query.preload('companyProfile'))
      .first()
    this.assertPending(invitation)
    return {
      id: invitation!.id,
      name: invitation!.name,
      role: invitation!.role,
      expiresAt: invitation!.expiresAt,
      invitedEmail: maskEmail(invitation!.invitedEmail),
      invitedPhone: maskPhone(invitation!.invitedPhone),
      company: {
        id: invitation!.company.id,
        name: invitation!.company.companyProfile?.companyName,
        city: invitation!.company.city,
      },
    }
  }

  async resend(context: CompanyContext, actorUserId: number, invitationId: number) {
    const token = randomBytes(32).toString('base64url')
    const invitation = await db.transaction(async (trx) => {
      const row = await CompanyInvitation.query({ client: trx })
        .where('id', invitationId)
        .where('companyId', context.companyId)
        .forUpdate()
        .first()
      this.assertPending(row)
      row!.useTransaction(trx)
      row!.tokenHash = hashToken(token)
      row!.expiresAt = DateTime.now().plus({ days: 7 })
      await row!.save()
      await this.audit(
        trx,
        context.companyId,
        actorUserId,
        'invitation.resent',
        'company_invitation',
        row!.id
      )
      const invitedEmail = row!.invitedEmail
      const existingUser = invitedEmail
        ? await User.query({ client: trx }).whereRaw('LOWER(email) = ?', [invitedEmail]).first()
        : null
      await notificationOutboxService.enqueue(
        {
          userId: existingUser?.id,
          clientContext: 'company_app',
          companyId: context.companyId,
          recipientEmail: row!.invitedEmail ?? undefined,
          type: 'company_invitation',
          title: 'Company invitation',
          message: `Your QaaAt company invitation was resent. Accept using this secure link: /company-invitations/accept?token=${token}`,
          sendEmail: Boolean(row!.invitedEmail),
          emailSubject: 'Your QaaAt invitation',
        },
        trx
      )
      return row!
    })
    return invitation
  }

  async cancelInvitation(context: CompanyContext, actorUserId: number, invitationId: number) {
    await db.transaction(async (trx) => {
      const row = await CompanyInvitation.query({ client: trx })
        .where('id', invitationId)
        .where('companyId', context.companyId)
        .forUpdate()
        .first()
      this.assertPending(row)
      row!.useTransaction(trx)
      row!.status = 'cancelled'
      row!.cancelledAt = DateTime.now()
      await row!.save()
      await this.audit(
        trx,
        context.companyId,
        actorUserId,
        'invitation.cancelled',
        'company_invitation',
        row!.id
      )
    })
  }

  async accept(
    token: string,
    authenticatedUser: User | null,
    input: { name?: string; password?: string }
  ) {
    const result = await db.transaction(async (trx) => {
      const invitation = await CompanyInvitation.query({ client: trx })
        .where('tokenHash', hashToken(token))
        .forUpdate()
        .first()
      this.assertPending(invitation)
      await invitation!.load('company')
      if (invitation!.company.deletedAt || invitation!.company.status !== 'approved')
        throw new CompanyMembershipException(
          'The company is not eligible to accept invitations',
          'COMPANY_NOT_ACTIVE',
          403
        )

      const invitedEmail = invitation!.invitedEmail
      if (!invitedEmail)
        throw new CompanyMembershipException(
          'Email delivery is required for invitation acceptance',
          'INVITATION_EMAIL_REQUIRED',
          422
        )
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
        `company-membership:${invitedEmail}`,
      ])

      let user = authenticatedUser
      if (user) {
        user = await User.query({ client: trx }).where('id', user.id).forUpdate().firstOrFail()
        const emailMatches =
          invitation!.invitedEmail && normalizeEmail(user.email) === invitation!.invitedEmail
        if (!emailMatches)
          throw new CompanyMembershipException(
            'The invitation does not match the authenticated identity',
            'INVITATION_IDENTITY_MISMATCH',
            403
          )
      } else {
        const existing = await User.query({ client: trx })
          .whereRaw('LOWER(email) = ?', [invitedEmail])
          .first()
        if (existing)
          throw new CompanyMembershipException(
            'Sign in to the existing account before accepting this invitation',
            'INVITATION_AUTHENTICATION_REQUIRED',
            401
          )
        if (!input.password)
          throw new CompanyMembershipException(
            'A password is required to create an account',
            'INVITATION_ACCOUNT_DETAILS_REQUIRED',
            422
          )
        user = await User.create(
          {
            userName: input.name ?? invitation!.name,
            email: invitedEmail,
            password: input.password,
            userType: 'user',
          },
          { client: trx }
        )
      }

      await this.assertMembershipAvailable(trx, user.id, invitation!.companyId)
      const exists = await CompanyMembership.query({ client: trx })
        .where('companyId', invitation!.companyId)
        .where('userId', user.id)
        .first()
      if (exists)
        throw new CompanyMembershipException(
          'This user already belongs to the company',
          'MEMBERSHIP_ALREADY_EXISTS'
        )
      const membership = await CompanyMembership.create(
        {
          companyId: invitation!.companyId,
          userId: user.id,
          role: invitation!.role,
          status: 'active',
          invitedByUserId: invitation!.invitedByUserId,
          joinedAt: DateTime.now(),
        },
        { client: trx }
      )
      const overrides = (invitation!.permissionOverrides ?? []) as Override[]
      for (const override of overrides)
        await CompanyMembershipPermission.create(
          {
            companyMembershipId: membership.id,
            permission: override.permission,
            effect: override.effect,
          },
          { client: trx }
        )
      invitation!.useTransaction(trx)
      invitation!.status = 'accepted'
      invitation!.acceptedByUserId = user.id
      invitation!.acceptedAt = DateTime.now()
      await invitation!.save()
      await this.audit(
        trx,
        invitation!.companyId,
        user.id,
        'invitation.accepted',
        'company_membership',
        membership.id,
        { invitationId: invitation!.id, role: membership.role }
      )
      return { user, membership }
    })
    const accessToken = await User.accessTokens.create(result.user, [
      'client:company_app',
      `company:${result.membership.companyId}`,
    ])
    const membership = await CompanyMembership.query()
      .where('id', result.membership.id)
      .preload('company')
      .preload('permissionOverrides')
      .firstOrFail()
    return { user: result.user, membership, token: accessToken.value!.release() }
  }

  async updateMember(
    context: CompanyContext,
    actorUserId: number,
    memberId: number,
    input: {
      role?: CompanyRole
      status?: 'active' | 'suspended' | 'revoked'
      permissionOverrides?: Override[]
    }
  ) {
    return db.transaction(async (trx) => {
      const member = await CompanyMembership.query({ client: trx })
        .where('id', memberId)
        .where('companyId', context.companyId)
        .forUpdate()
        .firstOrFail()
      this.assertMemberMutationAllowed(context, member, input)
      if (
        member.status === 'revoked' &&
        input.status &&
        ['active', 'suspended'].includes(input.status)
      ) {
        await User.query({ client: trx }).where('id', member.userId).forUpdate().firstOrFail()
        await this.assertMembershipAvailable(trx, member.userId, context.companyId, member.id)
      }
      if (
        member.role === 'owner' &&
        member.status === 'active' &&
        ((input.role && input.role !== 'owner') || (input.status && input.status !== 'active'))
      )
        await this.assertNotLastOwner(trx, context.companyId, member.id)
      member.useTransaction(trx)
      if (input.role) member.role = input.role
      if (input.status) member.status = input.status
      await member.save()
      if (input.permissionOverrides) {
        await CompanyMembershipPermission.query({ client: trx })
          .where('companyMembershipId', member.id)
          .delete()
        for (const item of input.permissionOverrides)
          await CompanyMembershipPermission.create(
            { companyMembershipId: member.id, permission: item.permission, effect: item.effect },
            { client: trx }
          )
      }
      if (input.status && input.status !== 'active')
        await this.accessRevocation.revoke(trx, context.companyId, [member.userId])
      await this.audit(
        trx,
        context.companyId,
        actorUserId,
        'membership.updated',
        'company_membership',
        member.id,
        { role: member.role, status: member.status }
      )
      await member.load('permissionOverrides')
      return member
    })
  }

  async revokeMember(context: CompanyContext, actorUserId: number, memberId: number) {
    return this.updateMember(context, actorUserId, memberId, { status: 'revoked' })
  }

  private assertPending(
    invitation: CompanyInvitation | null
  ): asserts invitation is CompanyInvitation {
    if (!invitation)
      throw new CompanyMembershipException('Invitation not found', 'INVITATION_NOT_FOUND', 404)
    if (invitation.status !== 'pending')
      throw new CompanyMembershipException(
        'Invitation is no longer pending',
        'INVITATION_NOT_PENDING'
      )
    if (invitation.expiresAt <= DateTime.now())
      throw new CompanyMembershipException('Invitation has expired', 'INVITATION_EXPIRED', 410)
  }

  private async assertNotLastOwner(trx: any, companyId: number, excludedId: number) {
    const owner = await CompanyMembership.query({ client: trx })
      .where('companyId', companyId)
      .where('role', 'owner')
      .where('status', 'active')
      .whereNot('id', excludedId)
      .forUpdate()
      .first()
    if (!owner)
      throw new CompanyMembershipException(
        'The last active owner cannot be removed or demoted',
        'LAST_ACTIVE_OWNER'
      )
  }

  private assertMemberMutationAllowed(
    context: CompanyContext,
    member: CompanyMembership,
    input: { role?: CompanyRole; permissionOverrides?: Override[] }
  ) {
    const actorIsOwner = context.role === 'owner'
    if (!actorIsOwner && (member.role === 'owner' || input.role === 'owner')) {
      throw new CompanyMembershipException(
        'Only an owner may assign or modify an owner membership',
        'OWNER_MANAGEMENT_REQUIRES_OWNER',
        403
      )
    }

    const requestedPermissions = resolvePermissions(
      (input.role ?? member.role) as CompanyRole,
      input.permissionOverrides ?? []
    )
    if (!actorIsOwner) this.assertDelegationWithinActor(context, requestedPermissions)
  }

  private assertInvitationAllowed(
    context: CompanyContext,
    role: CompanyRole,
    overrides: Override[] = []
  ) {
    if (context.role !== 'owner' && role === 'owner') {
      throw new CompanyMembershipException(
        'Only an owner may invite another owner',
        'OWNER_MANAGEMENT_REQUIRES_OWNER',
        403
      )
    }
    if (context.role !== 'owner') {
      this.assertDelegationWithinActor(context, resolvePermissions(role, overrides))
    }
  }

  private assertDelegationWithinActor(
    context: CompanyContext,
    requestedPermissions: CompanyPermission[]
  ) {
    if (requestedPermissions.includes('payout_settings.manage')) {
      throw new CompanyMembershipException(
        'Only an owner may grant payout settings access',
        'PAYOUT_PERMISSION_REQUIRES_OWNER',
        403
      )
    }
    const unauthorized = requestedPermissions.find(
      (permission) => !context.permissions.includes(permission)
    )
    if (unauthorized) {
      throw new CompanyMembershipException(
        `Cannot grant permission ${unauthorized}`,
        'PERMISSION_DELEGATION_EXCEEDED',
        403
      )
    }
  }

  private async assertMembershipAvailable(
    trx: any,
    userId: number,
    companyId: number,
    excludedMembershipId?: number
  ) {
    const query = CompanyMembership.query({ client: trx })
      .where('userId', userId)
      .whereIn('status', ['active', 'suspended'])
    if (excludedMembershipId) query.whereNot('id', excludedMembershipId)
    const currentMembership = await query.first()
    if (!currentMembership) return
    if (currentMembership.companyId === companyId)
      throw new CompanyMembershipException(
        'This user already belongs to the company',
        'MEMBERSHIP_ALREADY_EXISTS'
      )
    throw new CompanyMembershipException(
      'A user may belong to only one current company',
      'COMPANY_MEMBERSHIP_LIMIT_REACHED'
    )
  }

  private async audit(
    trx: any,
    companyId: number,
    actorUserId: number | null,
    action: string,
    targetType: string,
    targetId: number,
    metadata?: Record<string, unknown>
  ) {
    await trx.table('company_audit_logs').insert({
      company_id: companyId,
      actor_user_id: actorUserId,
      action,
      target_type: targetType,
      target_id: targetId,
      metadata: metadata ?? null,
      created_at: DateTime.now().toSQL(),
    })
  }
}
