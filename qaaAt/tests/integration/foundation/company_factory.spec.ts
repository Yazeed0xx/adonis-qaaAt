import { test } from '@japa/runner'
import { CompanyFactory } from '#database/factories/company_factory'
import { withTruncateIsolation } from '#tests/support/database'

test.group('Company factory invariant', (group) => {
  group.each.setup(withTruncateIsolation)

  test('creates one active owner membership for every company', async ({ db }) => {
    const company = await CompanyFactory.apply('approved')
      .with('user', 1, (user) => user.apply('company', 'verified'))
      .create()

    db.assertHas('company_memberships', {
      company_id: company.id,
      user_id: company.userId,
      role: 'owner',
      status: 'active',
    })
    db.assertCount('company_memberships', 1)
  })
})
