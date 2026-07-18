import { test } from '@japa/runner'
import { createAdmin, createCustomer } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'

test.group('Admin authentication', (group) => {
  group.each.setup(withTruncateIsolation)

  test('admin login, profile, and logout preserve the admin client boundary', async ({
    client,
  }) => {
    const admin = await createAdmin({
      userName: 'Platform Admin',
      email: 'admin@example.com',
      password: 'password123',
    })
    const login = await client
      .post('/api/admin/login')
      .json({ email: admin.email, password: 'password123' })
    login.assertStatus(200)
    login.assertBodyContains({
      message: 'Login successful',
      data: {
        user: { id: admin.id, email: admin.email, userType: 'admin' },
        token: { type: 'bearer' },
      },
    })
    const token = login.body().data.token.token

    const me = await client.get('/api/admin/me').header('Authorization', `Bearer ${token}`)
    me.assertStatus(200)
    me.assertBodyContains({ data: { user: { id: admin.id, userType: 'admin' } } })

    const logout = await client.post('/api/admin/logout').header('Authorization', `Bearer ${token}`)
    logout.assertStatus(200)
    const revoked = await client.get('/api/admin/me').header('Authorization', `Bearer ${token}`)
    revoked.assertStatus(401)
  })

  test('customer credentials cannot create an admin session', async ({ client, assert }) => {
    const customer = await createCustomer({
      email: 'customer@example.com',
      password: 'password123',
    })
    const response = await client
      .post('/api/admin/login')
      .json({ email: customer.email, password: 'password123' })

    response.assertStatus(401)
    assert.deepEqual(response.body(), {
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
    })
  })
})
