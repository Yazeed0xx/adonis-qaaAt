import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'

test.group('Functional test foundation', (group) => {
  group.each.setup(withTruncateIsolation)

  test('uses the real HTTP server and exact response contract', async ({ client, db }) => {
    const response = await client.get('/health/live')

    response.assertStatus(200)
    response.assertBody({ status: 'ok' })
    await db.assertEmpty('users')
  })
})
