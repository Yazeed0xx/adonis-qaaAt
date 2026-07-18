import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Company from '#models/company'
import InvalidStateException from '#exceptions/invalid_state_exception'
import adminAuditService from '#services/admin_audit_service'
import notificationOutboxService from '#services/notification_outbox_service'
import { CompanyAccessRevocationService } from '#services/company_access_revocation_service'

export class CompanyModerationService {
  constructor(private accessRevocation = new CompanyAccessRevocationService()) {}

  async approve(companyId: number, adminUserId: number): Promise<Company> {
    const company = await Company.findOrFail(companyId)

    if (company.status === 'approved') {
      throw new InvalidStateException('Company is already approved', 'COMPANY_ALREADY_APPROVED')
    }

    await company.load('companyProfile')
    const companyName = company.companyProfile?.companyName || 'Your company'

    await db.transaction(async (trx) => {
      const owners = await trx
        .from('company_memberships')
        .where('company_id', company.id)
        .where('role', 'owner')
        .where('status', 'active')
        .select('user_id')
      const ownerUserIds = [...new Set(owners.map((owner) => owner.user_id))]

      company.useTransaction(trx)
      company.status = 'approved'
      company.approvedAt = DateTime.now()
      company.approvedBy = adminUserId
      company.rejectionReason = null
      company.rejectedAt = null
      await company.save()

      await adminAuditService.record(
        {
          adminUserId,
          action: 'company.approve',
          targetType: 'company',
          targetId: company.id,
          metadata: { ownerUserIds },
        },
        trx
      )

      for (const userId of ownerUserIds) {
        await notificationOutboxService.enqueue(
          {
            userId,
            clientContext: 'company_app',
            companyId: company.id,
            type: 'company_approved',
            title: 'Company Approved',
            message: `Congratulations! Your company "${companyName}" has been approved. You can now create spaces and start receiving bookings.`,
            sendEmail: true,
            emailSubject: 'Your Company Has Been Approved - QaaAt',
          },
          trx
        )
      }
    })

    return company
  }

  async reject(companyId: number, adminUserId: number, reason: string): Promise<Company> {
    const company = await Company.findOrFail(companyId)

    if (company.status === 'rejected') {
      throw new InvalidStateException('Company is already rejected', 'COMPANY_ALREADY_REJECTED')
    }

    await company.load('companyProfile')
    const companyName = company.companyProfile?.companyName || 'Your company'

    await db.transaction(async (trx) => {
      const owners = await trx
        .from('company_memberships')
        .where('company_id', company.id)
        .where('role', 'owner')
        .where('status', 'active')
        .select('user_id')
      const ownerUserIds = [...new Set(owners.map((owner) => owner.user_id))]

      company.useTransaction(trx)
      company.status = 'rejected'
      company.rejectionReason = reason
      company.rejectedAt = DateTime.now()
      company.approvedAt = null
      company.approvedBy = null
      await company.save()

      await adminAuditService.record(
        {
          adminUserId,
          action: 'company.reject',
          targetType: 'company',
          targetId: company.id,
          reason,
          metadata: { ownerUserIds },
        },
        trx
      )

      for (const userId of ownerUserIds) {
        await notificationOutboxService.enqueue(
          {
            userId,
            clientContext: 'company_app',
            companyId: company.id,
            type: 'company_rejected',
            title: 'Company Registration Rejected',
            message: `Your company "${companyName}" registration was rejected. Reason: ${reason}`,
            data: { reason },
            sendEmail: true,
            emailSubject: 'Company Registration Update - QaaAt',
          },
          trx
        )
      }
    })

    return company
  }

  async suspend(companyId: number, adminUserId: number, reason: string): Promise<Company> {
    return db.transaction(async (trx) => {
      const company = await Company.query({ client: trx })
        .where('id', companyId)
        .forUpdate()
        .firstOrFail()

      if (company.status !== 'approved') {
        throw new InvalidStateException(
          'Only approved companies can be suspended',
          'COMPANY_SUSPEND_INVALID_STATE'
        )
      }

      const memberships = await trx
        .from('company_memberships')
        .where('company_id', company.id)
        .select('user_id')
      const userIds = [...new Set(memberships.map((membership) => membership.user_id))]

      company.useTransaction(trx)
      company.status = 'suspended'
      company.rejectionReason = reason
      await company.save()

      const revoked = await this.accessRevocation.revoke(trx, company.id, userIds)
      await adminAuditService.record(
        {
          adminUserId,
          action: 'company.suspend',
          targetType: 'company',
          targetId: company.id,
          reason,
          metadata: {
            affectedUserCount: userIds.length,
            revokedPushInstallations: revoked.revokedPushInstallations,
            revokedTokens: revoked.revokedTokens,
          },
        },
        trx
      )

      return company
    })
  }

  async reactivate(companyId: number, adminUserId: number, reason: string): Promise<Company> {
    return db.transaction(async (trx) => {
      const company = await Company.query({ client: trx })
        .where('id', companyId)
        .forUpdate()
        .firstOrFail()

      if (company.status !== 'suspended') {
        throw new InvalidStateException(
          'Only suspended companies can be reactivated',
          'COMPANY_REACTIVATE_INVALID_STATE'
        )
      }

      company.useTransaction(trx)
      company.status = 'approved'
      company.rejectionReason = null
      await company.save()

      await adminAuditService.record(
        {
          adminUserId,
          action: 'company.reactivate',
          targetType: 'company',
          targetId: company.id,
          reason,
          metadata: { sessionsRestored: false },
        },
        trx
      )

      return company
    })
  }
}

export default new CompanyModerationService()
