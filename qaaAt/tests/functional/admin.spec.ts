import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { CompanyFactory } from '#database/factories/company_factory'
import { UserFactory } from '#database/factories/user_factory'

test.group('Admin endpoints', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('lists pending companies when optional admin relations are not preloaded', async ({
    client,
  }) => {
    const admin = await UserFactory.apply('admin', 'verified').create()
    const company = await CompanyFactory.apply('pending')
      .with('user', 1, (user) => {
        user.apply('company', 'verified').merge({ email: 'pending-company@example.com' })
      })
      .with('companyProfile', 1, (profile) => {
        profile.merge({ companyName: 'Pending Events Company' })
      })
      .create()

    const response = await client
      .get('/api/admin/companies/pending')
      .withGuard('api')
      .loginAs(admin)

    response.assertStatus(200)
    response.assertBodyContains({
      data: [
        {
          id: company.id,
          status: 'pending',
          user: {
            email: 'pending-company@example.com',
            userType: 'company',
          },
          companyProfile: {
            companyName: 'Pending Events Company',
          },
        },
      ],
      metadata: {
        total: 1,
      },
    })
  })
})
