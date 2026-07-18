import { test } from '@japa/runner'
import CompanyMembership from '#models/company_membership'
import { CompanyContextService } from '#services/company_context_service'
import { createApprovedCompanyOwner, createCustomer } from '#tests/support/actors'
import { withTransactionIsolation } from '#tests/support/database'

test.group('Company context service', (group) => {
  group.each.setup(withTransactionIsolation)

  test('resolves the single active membership and its effective permissions', async ({
    assert,
  }) => {
    const companyOwner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const employee = await createCustomer({ email: 'employee@example.com' })
    const selected = await CompanyMembership.create({
      companyId: companyOwner.company.id,
      userId: employee.id,
      role: 'booking_staff',
      status: 'active',
      joinedAt: companyOwner.company.createdAt,
    })

    const context = await new CompanyContextService().resolve(employee.id, companyOwner.company.id)

    assert.equal(context.companyId, companyOwner.company.id)
    assert.equal(context.membership.id, selected.id)
    assert.equal(context.role, 'booking_staff')
    assert.include(context.permissions, 'booking_requests.manage')
    assert.notInclude(context.permissions, 'members.manage')
  })

  test('rejects a missing explicit membership without recreating it', async ({ assert, db }) => {
    const actor = await createApprovedCompanyOwner({ user: { email: 'missing@example.com' } })
    await actor.membership.delete()

    await assert.rejects(
      () => new CompanyContextService().resolve(actor.user.id, actor.company.id),
      /Active company membership required/
    )

    db.assertMissing('company_memberships', {
      company_id: actor.company.id,
      user_id: actor.user.id,
    })
  })

  test('rejects suspended and revoked memberships without recreating them', async ({ assert }) => {
    const actor = await createApprovedCompanyOwner({ user: { email: 'inactive@example.com' } })
    const service = new CompanyContextService()

    for (const status of ['suspended', 'revoked'] as const) {
      actor.membership.status = status
      await actor.membership.save()

      await assert.rejects(
        () => service.resolve(actor.user.id, actor.company.id),
        /Active company membership required/
      )
    }
  })
})
