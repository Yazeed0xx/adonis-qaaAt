import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { ExpoPushMessage, ExpoPushReceipt, ExpoPushTicket } from 'expo-server-sdk'
import pushConfig from '#config/push'
import type { PushProvider } from '#services/push_provider'
import { PushDeliveryService } from '#services/push_delivery_service'
import { createCustomer } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'
import { createNotification, createPushInstallation } from '#tests/support/scenarios/notifications'

class FakePushProvider implements PushProvider {
  messages: ExpoPushMessage[] = []
  tickets: ExpoPushTicket[] = [{ status: 'ok', id: 'ticket-1' }]
  receipts: Record<string, ExpoPushReceipt> = { 'ticket-1': { status: 'ok' } }

  async send(messages: ExpoPushMessage[]) {
    this.messages.push(...messages)
    return this.tickets
  }

  async getReceipts() {
    return this.receipts
  }
}

async function createDelivery(attempts = 0) {
  const customer = await createCustomer()
  const installation = await createPushInstallation(customer, 'customer_app')
  const notification = await createNotification(customer, {
    type: 'booking_rejected',
    title: 'Sensitive title',
    message: 'Private rejection reason',
    data: { bookingId: 291, reason: 'Private rejection reason', customerName: 'Private customer' },
  })
  const [delivery] = await db
    .table('push_deliveries')
    .insert({
      notification_id: notification.id,
      push_installation_id: installation.id,
      status: 'pending',
      attempts,
    })
    .returning('*')
  return { customer, installation, notification, delivery }
}

test.group('Push delivery worker', (group) => {
  group.each.setup(withTruncateIsolation)
  group.each.setup(() => {
    const enabled = pushConfig.enabled
    pushConfig.enabled = true
    return () => {
      pushConfig.enabled = enabled
    }
  })

  test('sends a redacted payload, stores the ticket, and confirms its receipt', async ({
    assert,
  }) => {
    const { notification } = await createDelivery()
    const provider = new FakePushProvider()
    const service = new PushDeliveryService(provider)

    assert.equal(await service.processPending(), 1)
    assert.deepEqual(provider.messages[0].data, {
      notificationId: Number(notification.id),
      type: 'booking_rejected',
      route: '/booking/291',
      bookingId: 291,
    })
    assert.equal(provider.messages[0].body, 'Your booking request was not accepted.')
    assert.notInclude(JSON.stringify(provider.messages[0]), 'Private rejection reason')
    assert.notInclude(JSON.stringify(provider.messages[0]), 'Private customer')

    await db
      .from('push_deliveries')
      .update({ sent_at: DateTime.now().minus({ minutes: 20 }).toSQL() })
    assert.equal(await service.processReceipts(), 1)
    const accepted = await db.from('push_deliveries').firstOrFail()
    assert.equal(accepted.status, 'provider_accepted')
  })

  test('schedules retryable provider failures and eventually marks them terminal', async ({
    assert,
  }) => {
    const { delivery } = await createDelivery()
    const provider = new FakePushProvider()
    provider.tickets = [
      {
        status: 'error',
        message: 'Provider overloaded',
        details: { error: 'MessageRateExceeded' },
      },
    ]
    const service = new PushDeliveryService(provider)

    assert.equal(await service.processPending(), 1)
    const retry = await db.from('push_deliveries').where('id', delivery.id).firstOrFail()
    assert.equal(retry.status, 'retry_scheduled')
    assert.equal(retry.attempts, 1)
    assert.equal(retry.last_error_code, 'MessageRateExceeded')
    assert.isAbove(new Date(retry.next_attempt_at).getTime(), Date.now())

    await db
      .from('push_deliveries')
      .where('id', delivery.id)
      .update({
        attempts: pushConfig.maxAttempts - 1,
        next_attempt_at: DateTime.now().minus({ second: 1 }).toSQL(),
      })
    assert.equal(await service.processPending(), 1)
    const failed = await db.from('push_deliveries').where('id', delivery.id).firstOrFail()
    assert.equal(failed.status, 'permanently_failed')
    assert.equal(failed.attempts, pushConfig.maxAttempts)
  })

  test('revokes the installation when the provider reports DeviceNotRegistered', async ({
    assert,
  }) => {
    const { installation } = await createDelivery()
    const provider = new FakePushProvider()
    provider.tickets = [
      {
        status: 'error',
        message: 'Device is no longer registered',
        details: { error: 'DeviceNotRegistered' },
      },
    ]

    assert.equal(await new PushDeliveryService(provider).processPending(), 1)
    const storedInstallation = await db
      .from('push_installations')
      .where('id', installation.id)
      .firstOrFail()
    assert.equal(storedInstallation.notifications_enabled, false)
    assert.isNotNull(storedInstallation.revoked_at)
    const failed = await db.from('push_deliveries').firstOrFail()
    assert.equal(failed.status, 'permanently_failed')
  })
})
