import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { UserFactory } from '#database/factories/user_factory'
import CompanyMembershipPermission from '#models/company_membership_permission'
import CompanyMembership from '#models/company_membership'
import paymentService from '#services/payment_service'
import { withTruncateIsolation } from '#tests/support/database'
import { setup } from '#tests/support/scenarios/payments'

test.group('Payments access', (group) => {
  group.each.setup(withTruncateIsolation)
  test('company finance APIs enforce tenant scope, deny overrides, and revoked membership', async ({
    client,
  }) => {
    const { customer, booking, company } = await setup()
    await paymentService.initiate(customer.id, booking.id, 'payment-rbac-0001')
    const employee = await UserFactory.apply('user', 'verified').create()
    const membership = await CompanyMembership.create({
      companyId: company.id,
      userId: employee.id,
      role: 'accountant',
      status: 'active',
      joinedAt: DateTime.now(),
    })
    const abilities = ['client:company_app', `company:${company.id}`]
    const allowed = await client
      .visit('company_payments.index')
      .withGuard('api')
      .loginAs(employee, abilities)
    allowed.assertStatus(200)
    await CompanyMembershipPermission.create({
      companyMembershipId: membership.id,
      permission: 'finance.view',
      effect: 'deny',
    })
    const denied = await client
      .visit('company_payments.index')
      .withGuard('api')
      .loginAs(employee, abilities)
    denied.assertStatus(403)
    await CompanyMembershipPermission.query().where('companyMembershipId', membership.id).delete()
    membership.status = 'revoked'
    await membership.save()
    const revoked = await client
      .visit('company_payments.index')
      .withGuard('api')
      .loginAs(employee, abilities)
    revoked.assertStatus(403)
  })
})
