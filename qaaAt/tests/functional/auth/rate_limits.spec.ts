import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'

test.group('Authentication rate limits', (group) => {
  group.each.setup(withTruncateIsolation)

  test('customer login and registration reject the sixth request in one limiter window', async ({
    client,
  }) => {
    let loginResponse
    for (let attempt = 0; attempt < 6; attempt++) {
      loginResponse = await client.visit('user_auth.login').json({
        email: `missing-${attempt}@example.com`,
        password: 'wrong-password',
      })
    }
    loginResponse!.assertStatus(429)

    let registrationResponse
    for (let attempt = 0; attempt < 6; attempt++) {
      registrationResponse = await client.visit('user_auth.register').json({
        userName: `Rate Limit User ${attempt}`,
        email: `rate-limit-${attempt}@example.com`,
        password: 'password123',
      })
    }
    registrationResponse!.assertStatus(429)
  })
})
