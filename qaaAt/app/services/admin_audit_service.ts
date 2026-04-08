import db from '@adonisjs/lucid/services/db'

interface AdminAuditEntry {
  adminUserId: number
  action: string
  targetType: string
  targetId: number
  reason?: string | null
  metadata?: Record<string, any> | null
}

export class AdminAuditService {
  async record(entry: AdminAuditEntry) {
    await db.table('admin_audit_logs').insert({
      admin_user_id: entry.adminUserId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      reason: entry.reason ?? null,
      metadata: entry.metadata ?? null,
      created_at: new Date(),
    })
  }
}

export default new AdminAuditService()
