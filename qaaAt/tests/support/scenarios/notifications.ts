import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type User from '#models/user'
import type { NotificationClientContext, NotificationType } from '#services/notification_service'

export const CUSTOMER_PUSH_TOKEN = 'ExponentPushToken[test-customer-device-0001]'
export const COMPANY_PUSH_TOKEN = 'ExponentPushToken[test-company-device-0001]'

export async function createNotification(
  user: User,
  overrides: {
    companyId?: number
    type?: NotificationType
    title?: string
    message?: string
    data?: Record<string, unknown>
    readAt?: DateTime | null
  } = {}
) {
  const [row] = await db
    .table('notifications')
    .insert({
      user_id: user.id,
      company_id: overrides.companyId ?? null,
      type: overrides.type ?? 'booking_created',
      title: overrides.title ?? 'Booking created',
      message: overrides.message ?? 'Your booking request was created.',
      data: overrides.data ?? null,
      read_at: overrides.readAt?.toSQL() ?? null,
      created_at: DateTime.now().toSQL(),
    })
    .returning('*')
  return row
}

export async function createPushInstallation(
  user: User,
  context: NotificationClientContext,
  overrides: {
    installationId?: string
    token?: string
    enabled?: boolean
    revokedAt?: DateTime | null
  } = {}
) {
  const [row] = await db
    .table('push_installations')
    .insert({
      user_id: user.id,
      client_context: context,
      installation_id: overrides.installationId ?? `${context}-${user.id}-installation-0001`,
      expo_push_token:
        overrides.token ?? (context === 'customer_app' ? CUSTOMER_PUSH_TOKEN : COMPANY_PUSH_TOKEN),
      platform: context === 'customer_app' ? 'ios' : 'android',
      notifications_enabled: overrides.enabled ?? true,
      revoked_at: overrides.revokedAt?.toSQL() ?? null,
      last_seen_at: DateTime.now().toSQL(),
    })
    .returning('*')
  return row
}

export async function enqueueNotification(
  user: User,
  clientContext: NotificationClientContext,
  overrides: {
    companyId?: number
    type?: NotificationType
    title?: string
    message?: string
    data?: Record<string, unknown>
  } = {}
) {
  const [row] = await db
    .table('notification_outbox')
    .insert({
      payload: {
        userId: user.id,
        clientContext,
        companyId: overrides.companyId,
        type: overrides.type ?? 'booking_created',
        title: overrides.title ?? 'Booking created',
        message: overrides.message ?? 'Your booking request was created.',
        data: overrides.data,
      },
      available_at: DateTime.now().toSQL(),
    })
    .returning('*')
  return row
}
