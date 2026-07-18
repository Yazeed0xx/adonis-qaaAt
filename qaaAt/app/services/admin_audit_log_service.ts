import db from '@adonisjs/lucid/services/db'

export interface AdminAuditQuery {
  scope: 'admin' | 'company' | 'booking'
  action?: string
  targetType?: string
  targetId?: number
  companyId?: number
  actorUserId?: number
  page?: number
  limit?: number
}

export class AdminAuditLogService {
  async list(input: AdminAuditQuery) {
    const table = `${input.scope}_audit_logs`
    const query = db.from(table)

    if (input.action) query.where('action', input.action)
    if (input.actorUserId)
      query.where(input.scope === 'admin' ? 'admin_user_id' : 'actor_user_id', input.actorUserId)
    if (input.companyId && input.scope !== 'admin') query.where('company_id', input.companyId)
    if (input.targetType && input.scope !== 'booking') query.where('target_type', input.targetType)
    if (input.targetId)
      query.where(input.scope === 'booking' ? 'booking_id' : 'target_id', input.targetId)

    return query
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .paginate(input.page ?? 1, input.limit ?? 20)
  }
}
