import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import notificationService, { type QueuedNotificationData } from '#services/notification_service'

interface OutboxRow {
  id: string
  payload: QueuedNotificationData
  attempts: number
}

export class NotificationOutboxService {
  async enqueue(payload: QueuedNotificationData, client: QueryClientContract): Promise<void> {
    await client
      .table('notification_outbox')
      .insert({ payload, available_at: DateTime.now().toSQL() })
  }

  async processPending(limit = 50): Promise<number> {
    const rows = (await db
      .from('notification_outbox')
      .whereNull('processed_at')
      .where('available_at', '<=', DateTime.now().toSQL())
      .orderBy('id', 'asc')
      .limit(limit)) as OutboxRow[]

    let processed = 0
    for (const row of rows) {
      try {
        await notificationService.notify({ ...row.payload, outboxId: row.id })
        await db
          .from('notification_outbox')
          .where('id', row.id)
          .whereNull('processed_at')
          .update({ processed_at: DateTime.now().toSQL(), last_error: null })
        processed++
      } catch (error) {
        const attempts = row.attempts + 1
        await db
          .from('notification_outbox')
          .where('id', row.id)
          .update({
            attempts,
            last_error: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown error',
            available_at: DateTime.now()
              .plus({ minutes: Math.min(60, 2 ** attempts) })
              .toSQL(),
          })
      }
    }

    return processed
  }
}

export default new NotificationOutboxService()
