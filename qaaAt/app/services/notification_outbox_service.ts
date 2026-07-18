import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import notificationService, { type QueuedNotificationData } from '#services/notification_service'
import pushFanoutService from '#services/push_fanout_service'

interface OutboxRow {
  id: string
  payload: QueuedNotificationData
  attempts: number
}

export const NOTIFICATION_OUTBOX_MAX_ATTEMPTS = 5

export class NotificationOutboxService {
  async enqueue(payload: QueuedNotificationData, client: QueryClientContract): Promise<void> {
    this.assertScope(payload)
    await client
      .table('notification_outbox')
      .insert({ payload, available_at: DateTime.now().toSQL() })
  }

  async processPending(limit = 50): Promise<number> {
    const rows = await db.transaction(async (trx) => {
      const claimed = (await trx
        .from('notification_outbox')
        .whereNull('processed_at')
        .whereNull('failed_at')
        .where('available_at', '<=', DateTime.now().toSQL())
        .where((query) => {
          query
            .whereNull('processing_started_at')
            .orWhere('processing_started_at', '<', DateTime.now().minus({ minutes: 5 }).toSQL())
        })
        .orderBy('id', 'asc')
        .forUpdate()
        .skipLocked()
        .limit(limit)) as OutboxRow[]

      if (claimed.length > 0) {
        await trx
          .from('notification_outbox')
          .whereIn(
            'id',
            claimed.map((row) => row.id)
          )
          .update({ processing_started_at: DateTime.now().toSQL() })
      }
      return claimed
    })

    let processed = 0
    for (const row of rows) {
      try {
        await db.transaction(async (trx) => {
          const current = await trx
            .from('notification_outbox')
            .where('id', row.id)
            .whereNull('processed_at')
            .forUpdate()
            .first()
          if (!current) return

          this.assertScope(row.payload)
          if (row.payload.userId) {
            const notification = await notificationService.persist(
              { ...row.payload, outboxId: row.id },
              trx
            )
            if (row.payload.clientContext) {
              await pushFanoutService.createDeliveries(
                notification.id,
                row.payload.userId,
                row.payload.clientContext,
                row.payload.companyId,
                row.payload.type,
                trx
              )
            }
          }
          await trx.from('notification_outbox').where('id', row.id).update({
            processed_at: DateTime.now().toSQL(),
            processing_started_at: null,
            last_error: null,
          })
        })
        await notificationService.dispatchEmail(row.payload)
        processed++
      } catch (error) {
        const attempts = row.attempts + 1
        const failedAt =
          attempts >= NOTIFICATION_OUTBOX_MAX_ATTEMPTS ? DateTime.now().toSQL() : null
        await db
          .from('notification_outbox')
          .where('id', row.id)
          .update({
            attempts,
            failed_at: failedAt,
            last_error: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown error',
            processing_started_at: null,
            available_at: DateTime.now()
              .plus({ minutes: Math.min(60, 2 ** attempts) })
              .toSQL(),
          })
      }
    }

    return processed
  }

  private assertScope(payload: QueuedNotificationData): void {
    if (payload.clientContext === 'company_app' && !payload.companyId) {
      throw new Error('companyId is required for company-app notifications')
    }
    if (payload.clientContext !== 'company_app' && payload.companyId) {
      throw new Error('companyId is forbidden for non-company notifications')
    }
  }
}

export default new NotificationOutboxService()
