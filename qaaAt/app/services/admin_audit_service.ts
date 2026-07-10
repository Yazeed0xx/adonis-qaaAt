import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

interface AdminAuditEntry {
  adminUserId: number
  action: string
  targetType: string
  targetId: number
  reason?: string | null
  metadata?: Record<string, any> | null
}

export class AdminAuditService {
  async record(entry: AdminAuditEntry, client?: QueryClientContract) {
    const query = client
      ? client.insertQuery().table('admin_audit_logs')
      : db.insertQuery().table('admin_audit_logs')

    await query.insert({
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
