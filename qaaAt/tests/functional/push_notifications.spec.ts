import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import assert from 'node:assert/strict'
import type { ExpoPushMessage, ExpoPushReceipt, ExpoPushTicket } from 'expo-server-sdk'
import pushConfig from '#config/push'
import { UserFactory } from '#database/factories/user_factory'
import { CompanyFactory } from '#database/factories/company_factory'
import notificationOutboxService from '#services/notification_outbox_service'
import { PushDeliveryService } from '#services/push_delivery_service'
import type { PushProvider } from '#services/push_provider'

const firstToken = 'ExponentPushToken[test-company-device-0001]'
const secondToken = 'ExponentPushToken[test-company-device-0002]'

async function createCompany(
  status: 'approved' | 'pending' | 'rejected' | 'suspended' = 'approved'
) {
  const owner = await UserFactory.apply('company', 'verified').create()
  const company = await CompanyFactory.apply(status).merge({ userId: owner.id }).create()
  return { owner, company }
}

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

test.group('Push notifications', (group) => {
  group.each.setup(() => testUtils.db().truncate())
  group.each.setup(() => {
    const previousEnabled = pushConfig.enabled
    pushConfig.enabled = false
    return () => {
      pushConfig.enabled = previousEnabled
    }
  })

  test('registers and refreshes an installation without exposing its token', async ({ client }) => {
    const { owner } = await createCompany()
    const payload = {
      installationId: 'device-installation-0001',
      expoPushToken: firstToken,
      platform: 'ios',
      deviceName: 'iPhone',
      appVersion: '1.0.0',
    }

    const created = await client
      .post('/api/companies/push-installations')
      .withGuard('api')
      .loginAs(owner)
      .json(payload)

    created.assertStatus(200)
    created.assertBodyContains({
      data: {
        installationId: payload.installationId,
        platform: 'ios',
        notificationsEnabled: true,
      },
    })
    assert.equal(JSON.stringify(created.body()).includes('expoPushToken'), false)

    const refreshed = await client
      .post('/api/companies/push-installations')
      .withGuard('api')
      .loginAs(owner)
      .json({ ...payload, expoPushToken: secondToken, platform: 'android' })
    refreshed.assertStatus(200)

    const rows = await db.from('push_installations')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].expo_push_token, secondToken)
    assert.equal(rows[0].platform, 'android')
  })

  test('registers a verified user installation and rejects unverified users', async ({
    client,
  }) => {
    const verifiedUser = await UserFactory.apply('user', 'verified').create()
    const unverifiedUser = await UserFactory.apply('user', 'unverified').create()
    const payload = {
      installationId: 'user-installation-0001',
      expoPushToken: firstToken,
      platform: 'android',
      appVersion: '1.0.0',
    }

    const registered = await client
      .post('/api/users/push-installations')
      .withGuard('api')
      .loginAs(verifiedUser)
      .json(payload)
    registered.assertStatus(200)
    assert.equal(JSON.stringify(registered.body()).includes('expoPushToken'), false)

    const unverified = await client
      .post('/api/users/push-installations')
      .withGuard('api')
      .loginAs(unverifiedUser)
      .json({ ...payload, installationId: 'user-installation-0002', expoPushToken: secondToken })
    unverified.assertStatus(403)
    unverified.assertBodyContains({ code: 'EMAIL_NOT_VERIFIED' })

    const row = await db.from('push_installations').firstOrFail()
    assert.equal(row.user_id, verifiedUser.id)
  })

  test('rejects invalid tokens, wrong account types, and suspended companies', async ({
    client,
  }) => {
    const regularUser = await UserFactory.apply('user', 'verified').create()
    const suspended = await createCompany('suspended')

    const invalid = await client
      .post('/api/companies/push-installations')
      .withGuard('api')
      .loginAs(suspended.owner)
      .json({
        installationId: 'device-installation-0002',
        expoPushToken: 'not-a-token',
        platform: 'ios',
      })
    invalid.assertStatus(422)

    const wrongType = await client
      .post('/api/companies/push-installations')
      .withGuard('api')
      .loginAs(regularUser)
      .json({
        installationId: 'device-installation-0002',
        expoPushToken: firstToken,
        platform: 'ios',
      })
    wrongType.assertStatus(403)

    const suspendedResponse = await client
      .post('/api/companies/push-installations')
      .withGuard('api')
      .loginAs(suspended.owner)
      .json({
        installationId: 'device-installation-0002',
        expoPushToken: firstToken,
        platform: 'ios',
      })
    suspendedResponse.assertStatus(403)
    suspendedResponse.assertBodyContains({ error: { code: 'ACCESS_DENIED' } })
  })

  test('moves an installation between accounts atomically and scopes revocation to its owner', async ({
    client,
  }) => {
    const first = await createCompany()
    const second = await createCompany()
    const installationId = 'shared-installation-0001'

    await client
      .post('/api/companies/push-installations')
      .withGuard('api')
      .loginAs(first.owner)
      .json({ installationId, expoPushToken: firstToken, platform: 'ios' })
    await client
      .post('/api/companies/push-installations')
      .withGuard('api')
      .loginAs(second.owner)
      .json({ installationId, expoPushToken: secondToken, platform: 'android' })

    const row = await db
      .from('push_installations')
      .where('installation_id', installationId)
      .firstOrFail()
    assert.equal(row.user_id, second.owner.id)

    const otherOwnerDelete = await client
      .delete(`/api/companies/push-installations/${installationId}`)
      .withGuard('api')
      .loginAs(first.owner)
    otherOwnerDelete.assertStatus(204)
    const afterOtherOwnerDelete = await db
      .from('push_installations')
      .where('id', row.id)
      .firstOrFail()
    assert.equal(afterOtherOwnerDelete.revoked_at, null)

    const ownerDelete = await client
      .delete(`/api/companies/push-installations/${installationId}`)
      .withGuard('api')
      .loginAs(second.owner)
    ownerDelete.assertStatus(204)
    const afterOwnerDelete = await db.from('push_installations').where('id', row.id).firstOrFail()
    assert.ok(afterOwnerDelete.revoked_at)
  })

  test('fans out an outbox notification once per active installation', async () => {
    const { owner } = await createCompany()
    await db.table('push_installations').insert([
      {
        user_id: owner.id,
        installation_id: 'fanout-device-0001',
        expo_push_token: firstToken,
        platform: 'ios',
        notifications_enabled: true,
        last_seen_at: DateTime.now().toSQL(),
      },
      {
        user_id: owner.id,
        installation_id: 'fanout-device-0002',
        expo_push_token: secondToken,
        platform: 'android',
        notifications_enabled: true,
        last_seen_at: DateTime.now().toSQL(),
      },
    ])

    await db.transaction((trx) =>
      notificationOutboxService.enqueue(
        {
          userId: owner.id,
          type: 'new_booking_request',
          title: 'New Booking Request',
          message: 'Review the new booking request.',
          data: { bookingId: 184 },
        },
        trx
      )
    )

    assert.equal(await notificationOutboxService.processPending(), 1)
    assert.equal(await notificationOutboxService.processPending(), 0)
    const notifications = await db.from('notifications')
    const deliveries = await db.from('push_deliveries')
    assert.equal(notifications.length, 1)
    assert.equal(deliveries.length, 2)
  })

  test('fans out and safely delivers booking updates to user installations', async () => {
    const user = await UserFactory.apply('user', 'verified').create()
    await db.table('push_installations').insert({
      user_id: user.id,
      installation_id: 'user-booking-device-0001',
      expo_push_token: firstToken,
      platform: 'android',
      notifications_enabled: true,
      last_seen_at: DateTime.now().toSQL(),
    })
    await db.transaction((trx) =>
      notificationOutboxService.enqueue(
        {
          userId: user.id,
          type: 'booking_rejected',
          title: 'Booking Rejected',
          message: 'Private rejection reason',
          data: { bookingId: 291, reason: 'Private rejection reason' },
        },
        trx
      )
    )

    assert.equal(await notificationOutboxService.processPending(), 1)
    const provider = new FakePushProvider()
    pushConfig.enabled = true
    assert.equal(await new PushDeliveryService(provider).processPending(), 1)

    assert.equal(provider.messages[0].channelId, 'booking_updates')
    assert.equal(provider.messages[0].body, 'Your booking request was not accepted.')
    const notification = await db.from('notifications').firstOrFail()
    assert.deepEqual(provider.messages[0].data, {
      notificationId: Number(notification.id),
      type: 'booking_rejected',
      route: '/booking/291',
      bookingId: 291,
    })
    assert.equal(JSON.stringify(provider.messages[0]).includes('Private rejection reason'), false)
  })

  test('stores Expo tickets, sends a safe payload, and confirms receipts', async () => {
    const { owner } = await createCompany()
    const [installationId] = await db
      .table('push_installations')
      .insert({
        user_id: owner.id,
        installation_id: 'delivery-device-0001',
        expo_push_token: firstToken,
        platform: 'ios',
        notifications_enabled: true,
        last_seen_at: DateTime.now().toSQL(),
      })
      .returning('id')
    const [notificationId] = await db
      .table('notifications')
      .insert({
        user_id: owner.id,
        type: 'new_booking_request',
        title: 'Sensitive original title',
        message: 'Sensitive original body',
        data: { bookingId: 184, userName: 'Private customer' },
        created_at: DateTime.now().toSQL(),
      })
      .returning('id')
    await db.table('push_deliveries').insert({
      notification_id: notificationId.id,
      push_installation_id: installationId.id,
      status: 'pending',
    })

    const provider = new FakePushProvider()
    const service = new PushDeliveryService(provider)
    pushConfig.enabled = true

    assert.equal(await service.processPending(), 1)
    assert.deepEqual(provider.messages[0].data, {
      notificationId: Number(notificationId.id),
      type: 'new_booking_request',
      route: '/booking/184',
      bookingId: 184,
    })
    assert.equal(provider.messages[0].body, 'A new booking request was received.')
    assert.equal(JSON.stringify(provider.messages[0]).includes('Private customer'), false)

    await db
      .from('push_deliveries')
      .update({ sent_at: DateTime.now().minus({ minutes: 20 }).toSQL() })
    assert.equal(await service.processReceipts(), 1)
    const acceptedDelivery = await db.from('push_deliveries').firstOrFail()
    assert.equal(acceptedDelivery.status, 'provider_accepted')
  })

  test('revokes an installation when Expo reports DeviceNotRegistered', async () => {
    const { owner } = await createCompany()
    const [installation] = await db
      .table('push_installations')
      .insert({
        user_id: owner.id,
        installation_id: 'invalid-device-0001',
        expo_push_token: firstToken,
        platform: 'ios',
        notifications_enabled: true,
        last_seen_at: DateTime.now().toSQL(),
      })
      .returning('id')
    const [notification] = await db
      .table('notifications')
      .insert({
        user_id: owner.id,
        type: 'company_approved',
        title: 'Approved',
        message: 'Approved',
        created_at: DateTime.now().toSQL(),
      })
      .returning('id')
    await db.table('push_deliveries').insert({
      notification_id: notification.id,
      push_installation_id: installation.id,
      status: 'pending',
    })

    const provider = new FakePushProvider()
    provider.tickets = [
      {
        status: 'error',
        message: 'Device is no longer registered',
        details: { error: 'DeviceNotRegistered' },
      },
    ]
    pushConfig.enabled = true
    await new PushDeliveryService(provider).processPending()

    const storedInstallation = await db.from('push_installations').firstOrFail()
    const delivery = await db.from('push_deliveries').firstOrFail()
    assert.ok(storedInstallation.revoked_at)
    assert.equal(storedInstallation.notifications_enabled, false)
    assert.equal(delivery.status, 'permanently_failed')
  })
})
