import { test } from '@japa/runner'
import { CompanyFactory } from '#database/factories/company_factory'
import { createAdmin, createCustomer } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'

test.group('Admin operational inspection', (group) => {
  group.each.setup(withTruncateIsolation)

  test('requires an admin identity for operational resources', async ({ client }) => {
    const customer = await createCustomer({ email: 'not-an-admin@example.com' })
    const anonymous = await client.visit('admin.get_users')
    anonymous.assertStatus(401)

    const forbidden = await client.visit('admin.get_users').withGuard('api').loginAs(customer)
    forbidden.assertStatus(403)
  })

  test('lists users with pagination while redacting credentials and tokens', async ({
    client,
    assert,
  }) => {
    const admin = await createAdmin({ email: 'inspection.admin@example.com' })
    const customer = await createCustomer({
      email: 'inspection.customer@example.com',
      password: 'never-serialize-this-password',
    })

    const response = await client
      .visit('admin.get_users')
      .withGuard('api')
      .loginAs(admin)
      .qs({ page: 1, limit: 1 })

    response.assertStatus(200)
    response.assertBodyContains({
      data: [{ id: customer.id, email: customer.email, userType: 'user' }],
      metadata: { total: 1, perPage: 1, currentPage: 1 },
    })
    const serialized = JSON.stringify(response.body())
    for (const privateField of ['password', 'rememberMeToken', 'accessToken', 'expoPushToken']) {
      assert.notInclude(serialized, privateField)
    }
  })

  test('lists pending companies when optional admin relations are absent', async ({ client }) => {
    const admin = await createAdmin({ email: 'pending.admin@example.com' })
    const company = await CompanyFactory.apply('pending')
      .with('user', 1, (user) => {
        user.apply('company', 'verified').merge({ email: 'pending-company@example.com' })
      })
      .with('companyProfile', 1, (profile) => {
        profile.merge({ companyName: 'Pending Events Company' })
      })
      .create()

    const response = await client
      .visit('admin.get_pending_companies')
      .withGuard('api')
      .loginAs(admin)

    response.assertStatus(200)
    response.assertBodyContains({
      data: [
        {
          id: company.id,
          status: 'pending',
          user: { email: 'pending-company@example.com', userType: 'company' },
          companyProfile: { companyName: 'Pending Events Company' },
        },
      ],
      metadata: { total: 1 },
    })
  })
})
