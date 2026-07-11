import type { QueryClientContract } from '@adonisjs/lucid/types/database'

export class PushFanoutService {
  async createDeliveries(
    notificationId: bigint | number,
    userId: number,
    client: QueryClientContract
  ): Promise<void> {
    const installations = await client
      .from('push_installations as installation')
      .join('users as user', 'user.id', 'installation.user_id')
      .leftJoin('companies as company', 'company.user_id', 'user.id')
      .select('installation.id')
      .where('installation.user_id', userId)
      .where('installation.notifications_enabled', true)
      .whereNull('installation.revoked_at')
      .whereNull('user.deleted_at')
      .where((query) => {
        query.where('user.user_type', 'user').orWhere((companyQuery) => {
          companyQuery
            .where('user.user_type', 'company')
            .whereNull('company.deleted_at')
            .whereNot('company.status', 'suspended')
        })
      })

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
