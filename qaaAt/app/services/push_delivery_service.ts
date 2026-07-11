import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { ExpoPushMessage, ExpoPushReceipt, ExpoPushTicket } from 'expo-server-sdk'
import pushConfig from '#config/push'
import { ExpoPushProvider } from '#services/expo_push_provider'
import type { PushProvider } from '#services/push_provider'

interface DeliveryRow {
  id: string
  notification_id: string
  push_installation_id: string
  expo_push_token: string
  attempts: number
  type: string
  data: Record<string, unknown> | string | null
}

const RETRYABLE_CODES = new Set(['MessageRateExceeded', 'ProviderError', 'ExpoError'])

export class PushDeliveryService {
  constructor(private provider: PushProvider = new ExpoPushProvider()) {}

  async processPending(limit = 100): Promise<number> {
    if (!pushConfig.enabled) return 0

    const ids = await this.claimSendable(limit)
    if (ids.length === 0) return 0

    const rows = (await db
      .from('push_deliveries as delivery')
      .join(
        'push_installations as installation',
        'installation.id',
        'delivery.push_installation_id'
      )
      .join('notifications as notification', 'notification.id', 'delivery.notification_id')
      .join('users as user', 'user.id', 'installation.user_id')
      .leftJoin('companies as company', 'company.user_id', 'user.id')
      .select(
        'delivery.id',
        'delivery.notification_id',
        'delivery.push_installation_id',
        'delivery.attempts',
        'installation.expo_push_token',
        'notification.type',
        'notification.data'
      )
      .whereIn('delivery.id', ids)
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
      })) as DeliveryRow[]

    const eligibleIds = new Set(rows.map((row) => String(row.id)))
    const ineligibleIds = ids.filter((id) => !eligibleIds.has(String(id)))
    if (ineligibleIds.length > 0) {
      await db.from('push_deliveries').whereIn('id', ineligibleIds).update({
        status: 'permanently_failed',
        processing_started_at: null,
        last_error_code: 'RECIPIENT_INELIGIBLE',
        last_error_message: 'Recipient or installation is no longer eligible for push delivery',
        updated_at: DateTime.now().toSQL(),
      })
    }

    if (rows.length === 0) return 0

    try {
      const tickets = await this.provider.send(rows.map((row) => this.toMessage(row)))
      if (tickets.length !== rows.length) {
        throw new Error('Push provider returned an unexpected ticket count')
      }
      for (const [index, row] of rows.entries()) {
        await this.applyTicket(row, tickets[index])
      }
    } catch (error) {
      for (const row of rows) {
        await this.scheduleRetry(row, 'PROVIDER_REQUEST_FAILED', this.sanitizeError(error))
      }
    }

    return rows.length
  }

  async processReceipts(limit = 300): Promise<number> {
    if (!pushConfig.enabled) return 0

    const cutoff = DateTime.now().minus({ hours: pushConfig.receiptCutoffHours })
    await db
      .from('push_deliveries')
      .where('status', 'ticket_received')
      .where('sent_at', '<', cutoff.toSQL())
      .update({
        status: 'permanently_failed',
        last_error_code: 'RECEIPT_EXPIRED',
        last_error_message: 'Expo receipt was unavailable before the retention cutoff',
        processing_started_at: null,
        updated_at: DateTime.now().toSQL(),
      })

    const rows = await db.transaction(async (trx) => {
      const claimed = await trx
        .from('push_deliveries')
        .select('id', 'expo_ticket_id', 'push_installation_id', 'attempts')
        .where('status', 'ticket_received')
        .whereNotNull('expo_ticket_id')
        .where(
          'sent_at',
          '<=',
          DateTime.now().minus({ minutes: pushConfig.receiptDelayMinutes }).toSQL()
        )
        .where('sent_at', '>=', cutoff.toSQL())
        .where((query) =>
          query
            .whereNull('next_attempt_at')
            .orWhere('next_attempt_at', '<=', DateTime.now().toSQL())
        )
        .where((query) =>
          query
            .whereNull('processing_started_at')
            .orWhere('processing_started_at', '<', DateTime.now().minus({ minutes: 5 }).toSQL())
        )
        .orderBy('id', 'asc')
        .forUpdate()
        .skipLocked()
        .limit(limit)

      if (claimed.length > 0) {
        await trx
          .from('push_deliveries')
          .whereIn(
            'id',
            claimed.map((row) => row.id)
          )
          .update({
            processing_started_at: DateTime.now().toSQL(),
          })
      }
      return claimed
    })

    if (rows.length === 0) return 0

    try {
      const receipts = await this.provider.getReceipts(
        rows.map((row) => String(row.expo_ticket_id))
      )
      for (const row of rows) {
        const receipt = receipts[String(row.expo_ticket_id)]
        if (!receipt) {
          await db
            .from('push_deliveries')
            .where('id', row.id)
            .update({
              processing_started_at: null,
              next_attempt_at: DateTime.now().plus({ minutes: 5 }).toSQL(),
              updated_at: DateTime.now().toSQL(),
            })
          continue
        }
        await this.applyReceipt(row, receipt)
      }
    } catch (error) {
      const message = this.sanitizeError(error)
      await db
        .from('push_deliveries')
        .whereIn(
          'id',
          rows.map((row) => row.id)
        )
        .update({
          processing_started_at: null,
          next_attempt_at: DateTime.now().plus({ minutes: 5 }).toSQL(),
          last_error_code: 'RECEIPT_REQUEST_FAILED',
          last_error_message: message,
          updated_at: DateTime.now().toSQL(),
        })
    }

    return rows.length
  }

  private async claimSendable(limit: number): Promise<string[]> {
    return db.transaction(async (trx) => {
      const rows = await trx
        .from('push_deliveries')
        .select('id')
        .whereIn('status', ['pending', 'retry_scheduled', 'sending'])
        .where((query) =>
          query
            .whereNull('next_attempt_at')
            .orWhere('next_attempt_at', '<=', DateTime.now().toSQL())
        )
        .where((query) =>
          query
            .whereNot('status', 'sending')
            .orWhere('processing_started_at', '<', DateTime.now().minus({ minutes: 5 }).toSQL())
        )
        .orderBy('id', 'asc')
        .forUpdate()
        .skipLocked()
        .limit(limit)

      const ids = rows.map((row) => String(row.id))
      if (ids.length > 0) {
        await trx.from('push_deliveries').whereIn('id', ids).update({
          status: 'sending',
          processing_started_at: DateTime.now().toSQL(),
          updated_at: DateTime.now().toSQL(),
        })
      }
      return ids
    })
  }

  private toMessage(row: DeliveryRow): ExpoPushMessage {
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data ?? {})
    const bookingId = typeof data.bookingId === 'number' ? data.bookingId : undefined
    const commonData: Record<string, unknown> = {
      notificationId: Number(row.notification_id),
      type: row.type,
      route: bookingId ? `/booking/${bookingId}` : '/',
    }
    if (bookingId) commonData.bookingId = bookingId

    if (row.type === 'new_booking_request') {
      return {
        to: row.expo_push_token,
        title: 'New booking request',
        body: 'A new booking request was received.',
        sound: 'default',
        priority: 'high',
        channelId: 'booking_requests',
        data: commonData,
      }
    }
    if (row.type === 'company_approved') {
      return {
        to: row.expo_push_token,
        title: 'Company approved',
        body: 'Your company has been approved.',
        sound: 'default',
        channelId: 'account_updates',
        data: commonData,
      }
    }
    if (row.type === 'company_rejected') {
      return {
        to: row.expo_push_token,
        title: 'Company registration update',
        body: 'Your company registration requires attention.',
        sound: 'default',
        channelId: 'account_updates',
        data: commonData,
      }
    }
    if (row.type === 'booking_accepted') {
      return {
        to: row.expo_push_token,
        title: 'Booking confirmed',
        body: 'Your booking request was accepted.',
        sound: 'default',
        channelId: 'booking_updates',
        data: commonData,
      }
    }
    if (row.type === 'booking_rejected') {
      return {
        to: row.expo_push_token,
        title: 'Booking update',
        body: 'Your booking request was not accepted.',
        sound: 'default',
        channelId: 'booking_updates',
        data: commonData,
      }
    }
    if (row.type === 'booking_expired') {
      return {
        to: row.expo_push_token,
        title: 'Booking request expired',
        body: 'Your booking request expired without a response.',
        sound: 'default',
        channelId: 'booking_updates',
        data: commonData,
      }
    }
    if (row.type === 'booking_cancelled') {
      return {
        to: row.expo_push_token,
        title: 'Booking cancelled',
        body: 'A booking was cancelled.',
        sound: 'default',
        channelId: 'booking_updates',
        data: commonData,
      }
    }
    return {
      to: row.expo_push_token,
      title: 'QaaAt update',
      body: 'You have a new notification.',
      sound: 'default',
      channelId: 'account_updates',
      data: commonData,
    }
  }

  private async applyTicket(row: DeliveryRow, ticket: ExpoPushTicket): Promise<void> {
    const attempts = row.attempts + 1
    if (ticket.status === 'ok') {
      await db.from('push_deliveries').where('id', row.id).update({
        status: 'ticket_received',
        expo_ticket_id: ticket.id,
        attempts,
        sent_at: DateTime.now().toSQL(),
        processing_started_at: null,
        next_attempt_at: null,
        last_error_code: null,
        last_error_message: null,
        updated_at: DateTime.now().toSQL(),
      })
      return
    }

    const code = ticket.details?.error ?? 'EXPO_TICKET_ERROR'
    if (code === 'DeviceNotRegistered') {
      await this.revokeAndFail(row, code, ticket.message)
    } else if (RETRYABLE_CODES.has(code)) {
      await this.scheduleRetry(row, code, ticket.message)
    } else {
      await this.fail(row.id, code, ticket.message, attempts)
    }
  }

  private async applyReceipt(
    row: { id: string; push_installation_id: string; attempts: number },
    receipt: ExpoPushReceipt
  ): Promise<void> {
    if (receipt.status === 'ok') {
      await db.from('push_deliveries').where('id', row.id).update({
        status: 'provider_accepted',
        provider_accepted_at: DateTime.now().toSQL(),
        receipt_checked_at: DateTime.now().toSQL(),
        processing_started_at: null,
        next_attempt_at: null,
        updated_at: DateTime.now().toSQL(),
      })
      return
    }

    const code = receipt.details?.error ?? 'EXPO_RECEIPT_ERROR'
    if (code === 'DeviceNotRegistered') {
      await this.revokeAndFail(row, code, receipt.message)
    } else if (RETRYABLE_CODES.has(code)) {
      await this.scheduleRetry(row, code, receipt.message)
    } else {
      await this.fail(row.id, code, receipt.message, row.attempts)
    }
  }

  private async revokeAndFail(
    row: { id: string; push_installation_id: string; attempts: number },
    code: string,
    message: string
  ) {
    await db.transaction(async (trx) => {
      const now = DateTime.now().toSQL()
      await trx.from('push_installations').where('id', row.push_installation_id).update({
        notifications_enabled: false,
        revoked_at: now,
        updated_at: now,
      })
      await trx
        .from('push_deliveries')
        .where('id', row.id)
        .update({
          status: 'permanently_failed',
          attempts: row.attempts + 1,
          processing_started_at: null,
          receipt_checked_at: now,
          last_error_code: code,
          last_error_message: message.slice(0, 500),
          updated_at: now,
        })
    })
  }

  private async scheduleRetry(
    row: { id: string; attempts: number },
    code: string,
    message: string
  ) {
    const attempts = row.attempts + 1
    if (attempts >= pushConfig.maxAttempts) {
      await this.fail(row.id, code, message, attempts)
      return
    }
    const delays = [30, 120, 600, 1800, 7200]
    const base = delays[Math.min(attempts - 1, delays.length - 1)]
    const jitter = Math.floor(Math.random() * Math.max(1, base * 0.2))
    await db
      .from('push_deliveries')
      .where('id', row.id)
      .update({
        status: 'retry_scheduled',
        attempts,
        expo_ticket_id: null,
        processing_started_at: null,
        next_attempt_at: DateTime.now()
          .plus({ seconds: base + jitter })
          .toSQL(),
        last_error_code: code,
        last_error_message: message.slice(0, 500),
        updated_at: DateTime.now().toSQL(),
      })
  }

  private async fail(id: string, code: string, message: string, attempts: number) {
    await db
      .from('push_deliveries')
      .where('id', id)
      .update({
        status: 'permanently_failed',
        attempts,
        processing_started_at: null,
        receipt_checked_at: DateTime.now().toSQL(),
        last_error_code: code,
        last_error_message: message.slice(0, 500),
        updated_at: DateTime.now().toSQL(),
      })
  }

  private sanitizeError(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 500) : 'Unknown push provider error'
  }
}

export default new PushDeliveryService()
