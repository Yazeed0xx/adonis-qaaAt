import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessDeniedException from '#exceptions/access_denied_exception'
import User from '#models/user'
import adminAuditService from '#services/admin_audit_service'
import pushInstallationService from '#services/push_installation_service'

export class UserModerationService {
  async ban(userId: number, adminUserId: number): Promise<User> {
    const user = await User.findOrFail(userId)

    if (user.userType === 'admin') {
      throw new AccessDeniedException('Cannot ban admin users')
    }

    await db.transaction(async (trx) => {
      user.useTransaction(trx)
      user.deletedAt = DateTime.now()
      await user.save()

      await trx.from('auth_access_tokens').where('tokenable_id', user.id).delete()
      await pushInstallationService.revokeAll(user.id, trx)
      await adminAuditService.record(
        {
          adminUserId,
          action: 'user.ban',
          targetType: 'user',
          targetId: user.id,
          metadata: { email: user.email },
        },
        trx
      )
    })

    return user
  }

  async unban(userId: number, adminUserId: number): Promise<User> {
    const user = await User.findOrFail(userId)

    user.deletedAt = null
    await user.save()

    await adminAuditService.record({
      adminUserId,
      action: 'user.unban',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: user.email },
    })

    return user
  }
}
