import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import { createCustomer } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'
import { CUSTOMER_PUSH_TOKEN } from '#tests/support/scenarios/notifications'

test.group('Customer push installation HTTP contract', (group) => {
  group.each.setup(withTruncateIsolation)

  test('registers and refreshes a verified customer installation without exposing its token', async ({
    client,
    assert,
  }) => {
    const customer = await createCustomer({ email: 'push.customer@example.com' })
    const payload = {
      installationId: 'customer-installation-0001',
      expoPushToken: CUSTOMER_PUSH_TOKEN,
      platform: 'ios' as const,
      deviceName: 'iPhone',
      appVersion: '1.0.0',
    }

    const created = await client
      .visit('user_push_installations.store')
      .withGuard('api')
      .loginAs(customer)
      .json(payload)
    created.assertStatus(200)
    created.assertBodyContains({
      data: { installationId: payload.installationId, platform: 'ios', notificationsEnabled: true },
    })
    assert.notInclude(JSON.stringify(created.body()), 'expoPushToken')

    const refreshed = await client
      .visit('user_push_installations.store')
      .withGuard('api')
      .loginAs(customer)
      .json({ ...payload, platform: 'android', appVersion: '2.0.0' })
    refreshed.assertStatus(200)

    const rows = await db.from('push_installations')
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].client_context, 'customer_app')
    assert.equal(rows[0].platform, 'android')
  })

  test('rejects unverified customers and invalid Expo tokens without persistence', async ({
    client,
    assert,
  }) => {
    const unverified = await UserFactory.apply('user', 'unverified')
      .merge({ email: 'push.unverified@example.com' })
      .create()
    const denied = await client
      .visit('user_push_installations.store')
      .withGuard('api')
      .loginAs(unverified)
      .json({
        installationId: 'customer-installation-0002',
        expoPushToken: CUSTOMER_PUSH_TOKEN,
        platform: 'android',
      })
    denied.assertStatus(403)

    const verified = await createCustomer({ email: 'push.invalid-token@example.com' })
    const invalid = await client
      .visit('user_push_installations.store')
      .withGuard('api')
      .loginAs(verified)
      .json({
        installationId: 'customer-installation-0003',
        expoPushToken: 'not-an-expo-token',
        platform: 'ios',
      })
    invalid.assertStatus(422)
    assert.lengthOf(await db.from('push_installations'), 0)
  })
})
