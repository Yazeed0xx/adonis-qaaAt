import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import CompanyMembershipPermission from '#models/company_membership_permission'
import { createCompanyMember } from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { responseItems, responseResource } from '#tests/support/responses'
import { createCatalog, createPricingScenario } from '#tests/support/scenarios/pricing'

test.group('Pricing catalog HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('provider catalog stores exact minor units and exposes only active attached pricing', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, space } = await createPricingScenario()
    const { rate, service } = await createCatalog(client, owner, space)
    assert.equal(rate.price_minor, '100000')
    assert.equal(service.price_minor, '10000')

    const providerRates = await client
      .visit('company_pricing.rate_plans')
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
    providerRates.assertStatus(200)
    assert.deepEqual(
      responseItems(providerRates.body()).map(({ id }) => id),
      [rate.id]
    )

    const publicPricing = await client.visit('public_pricing.show', { spaceId: space.id })
    publicPricing.assertStatus(200)
    const publicCatalog = responseResource(publicPricing.body()) as {
      ratePlans: unknown[]
      serviceOptions: unknown[]
    }
    assert.lengthOf(publicCatalog.ratePlans, 1)
    assert.lengthOf(publicCatalog.serviceOptions, 1)

    await client
      .visit('company_pricing.archive_service', { id: service.id as number })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
    const afterArchive = await client.visit('public_pricing.show', { spaceId: space.id })
    assert.lengthOf(
      (responseResource(afterArchive.body()) as { serviceOptions: unknown[] }).serviceOptions,
      0
    )
  })

  test('rate-plan mode rejects fields that contradict the selected pricing model', async ({
    client,
  }) => {
    freezeTestTime()
    const { owner, space } = await createPricingScenario()
    const invalid = await client
      .visit('company_pricing.store_rate_plan')
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({
        spaceId: space.id,
        nameAr: 'سعر يومي',
        pricingMode: 'full_day',
        priceMinor: '10000',
        pricesIncludeVat: false,
        vatRateBps: 1500,
        minimumDurationMinutes: 60,
      })
    invalid.assertStatus(422)
    invalid.assertBodyContains({ error: { code: 'RATE_PLAN_MODE_INVALID' } })
  })

  test('pricing mutations honor membership state and explicit permission denies', async ({
    client,
  }) => {
    freezeTestTime()
    const { company, space } = await createPricingScenario()
    const manager = await createCompanyMember(company, 'manager')
    await CompanyMembershipPermission.create({
      companyMembershipId: manager.membership.id,
      permission: 'pricing.manage',
      effect: 'deny',
    })
    const denied = await client
      .visit('company_pricing.store_rate_plan')
      .withGuard('api')
      .loginAs(manager.user, companyTokenAbilities(manager.membership.companyId))
      .json({
        spaceId: space.id,
        nameAr: 'ممنوع',
        pricingMode: 'full_day',
        priceMinor: '10000',
        pricesIncludeVat: false,
        vatRateBps: 1500,
      })
    denied.assertStatus(403)
    denied.assertBodyContains({ error: { code: 'COMPANY_PERMISSION_REQUIRED' } })

    await db
      .from('company_memberships')
      .where('id', manager.membership.id)
      .update({ status: 'revoked' })
    const revoked = await client
      .visit('company_pricing.rate_plans')
      .withGuard('api')
      .loginAs(manager.user, companyTokenAbilities(manager.membership.companyId))
    revoked.assertStatus(403)
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
