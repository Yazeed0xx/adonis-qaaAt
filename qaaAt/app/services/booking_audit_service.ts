import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

export type BookingAuditAction = 'booking.accept' | 'booking.reject'

interface BookingAuditEntry {
  actorUserId: number
  bookingId: number
  companyId: number
  action: BookingAuditAction
  previousStatus: string
  nextStatus: string
  reason?: string | null
  metadata?: Record<string, unknown> | null
}

export class BookingAuditService {
  async record(entry: BookingAuditEntry, client?: QueryClientContract) {
    const query = client
      ? client.insertQuery().table('booking_audit_logs')
      : db.insertQuery().table('booking_audit_logs')

    await query.insert({
      actor_user_id: entry.actorUserId,
      booking_id: entry.bookingId,
      company_id: entry.companyId,
      action: entry.action,
      previous_status: entry.previousStatus,
      next_status: entry.nextStatus,
      reason: entry.reason ?? null,
      metadata: entry.metadata ?? null,
      created_at: new Date(),
    })
  }
}

export default new BookingAuditService()
