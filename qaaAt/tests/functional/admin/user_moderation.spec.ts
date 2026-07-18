import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import { createAdmin } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'

test.group('Admin user moderation', (group) => {
  group.each.setup(withTruncateIsolation)

  test('banning a customer revokes every push installation', async ({ client, assert }) => {
    const admin = await createAdmin()
    const customer = await UserFactory.apply('user', 'verified').create()
    await db.table('push_installations').insert({
      user_id: customer.id,
      client_context: 'customer_app',
      installation_id: 'banned-customer-installation-0001',
      expo_push_token: 'ExponentPushToken[banned-customer-installation]',
      platform: 'android',
      notifications_enabled: true,
      last_seen_at: new Date(),
    })

    const response = await client
      .post(`/api/admin/users/${customer.id}/ban`)
      .withGuard('api')
      .loginAs(admin)
    response.assertStatus(200)

    const installation = await db
      .from('push_installations')
      .where('user_id', customer.id)
      .firstOrFail()
    assert.equal(installation.notifications_enabled, false)
    assert.isNotNull(installation.revoked_at)
  })
})
