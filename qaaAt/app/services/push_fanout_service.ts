import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import type { NotificationClientContext, NotificationType } from '#services/notification_service'

export class PushFanoutService {
  async createDeliveries(
    notificationId: bigint | number,
    userId: number,
    clientContext: NotificationClientContext,
    companyId: number | undefined,
    notificationType: NotificationType,
    client: QueryClientContract
  ): Promise<void> {
    const query = client
      .from('push_installations as installation')
      .join('users as user', 'user.id', 'installation.user_id')
      .select('installation.id')
      .where('installation.user_id', userId)
      .where('installation.client_context', clientContext)
      .where('installation.notifications_enabled', true)
      .whereNull('installation.revoked_at')
      .whereNull('user.deleted_at')

    if (clientContext === 'company_app') {
      if (!companyId) return
      const company = await client
        .from('companies')
        .where('id', companyId)
        .whereNull('deleted_at')
        .whereNot('status', 'suspended')
        .first()
      if (!company) return
      if (notificationType !== 'company_invitation') {
        query
          .join('company_memberships as membership', (join) => {
            join.on('membership.user_id', 'installation.user_id')
          })
          .where('membership.company_id', companyId)
          .where('membership.status', 'active')
      }
    } else {
      query.where('user.user_type', 'user')
    }

    const installations = await query

    if (installations.length === 0) return

    await client
      .table('push_deliveries')
      .insert(
        installations.map((installation) => ({
          notification_id: notificationId,
          push_installation_id: installation.id,
          status: 'pending',
        }))
      )
      .onConflict(['notification_id', 'push_installation_id'])
      .ignore()
  }
}

export default new PushFanoutService()
