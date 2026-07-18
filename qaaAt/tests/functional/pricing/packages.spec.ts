import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import { freezeTestTime } from '#tests/support/clock'
import { responseResource } from '#tests/support/responses'
import { createPricingScenario } from '#tests/support/scenarios/pricing'

test.group('Pricing package HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('package responses preserve normalized service and descriptive items', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, space } = await createPricingScenario()
    const serviceResponse = await client
      .visit('company_pricing.store_service')
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({
        nameAr: 'تجهيز',
        priceMinor: '5000',
        pricesIncludeVat: true,
        vatRateBps: 1500,
        isActive: true,
      })
    const service = responseResource(serviceResponse.body()) as Record<string, unknown> & {
      id: number
    }
    const created = await client
      .visit('company_pricing.store_package')
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({
        spaceId: space.id,
        nameAr: 'باقة الزفاف',
        basePriceMinor: '250000',
        pricesIncludeVat: true,
        vatRateBps: 1500,
        isActive: true,
        items: [
          { serviceOptionId: service.id, itemType: 'service', quantity: 2, isIncluded: true },
          { itemType: 'bridal_room', descriptionAr: 'غرفة العروس', quantity: 1, isIncluded: true },
        ],
      })
    created.assertStatus(201)
    assert.lengthOf((responseResource(created.body()) as { items: unknown[] }).items, 2)

    const publicResponse = await client.visit('public_pricing.show', { spaceId: space.id })
    const packageItem = (
      responseResource(publicResponse.body()) as {
        packages: Array<{ items: Array<Record<string, unknown>> }>
      }
    ).packages[0].items[1]
    assert.deepInclude(packageItem, {
      itemType: 'bridal_room',
      description: 'غرفة العروس',
      quantity: 1,
      isIncluded: true,
    })
  })

  test('package cannot reference another company service', async ({ client }) => {
    freezeTestTime()
    const first = await createPricingScenario()
    const second = await createPricingScenario()
    const serviceResponse = await client
      .visit('company_pricing.store_service')
      .withGuard('api')
      .loginAs(second.owner, companyTokenAbilities(second.company))
      .json({
        nameAr: 'خدمة شركة أخرى',
        priceMinor: '5000',
        pricesIncludeVat: true,
        vatRateBps: 1500,
        isActive: true,
      })
    const service = responseResource(serviceResponse.body()) as Record<string, unknown> & {
      id: number
    }
    const rejected = await client
      .visit('company_pricing.store_package')
      .withGuard('api')
      .loginAs(first.owner, companyTokenAbilities(first.company))
      .json({
        spaceId: first.space.id,
        nameAr: 'مرجع غير صالح',
        basePriceMinor: '10000',
        pricesIncludeVat: true,
        vatRateBps: 1500,
        items: [
          { serviceOptionId: service.id, itemType: 'service', quantity: 1, isIncluded: true },
        ],
      })
    rejected.assertStatus(404)
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
