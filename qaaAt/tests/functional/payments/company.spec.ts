import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { createAdmin } from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { withTruncateIsolation } from '#tests/support/database'
import { confirm, setup } from '#tests/support/scenarios/payments'

test.group('Company and admin finance HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('owner versions cancellation policies and provider cancellation refunds the full payment', async ({
    client,
  }) => {
    freezeTestTime()
    const { owner, company, customer, booking } = await setup()
    const created = await client
      .visit('company_payments.store_policy')
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
      .json({
        name: 'Provider cancellation policy',
        depositNonRefundable: false,
        tiers: [{ minimumHours: 0, refundPercent: 25 }],
      })
    created.assertStatus(201)
    created.assertBodyContains({ data: { version: 2, is_active: true } })
    const policies = await client
      .visit('company_payments.policies')
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
    policies.assertStatus(200)
    policies.assertBodyContains({ data: [{ version: 2 }, { version: 1 }] })

    await confirm(customer, booking, 'company-cancel-http-payment')
    const cancelled = await client
      .visit('company_payments.cancel', { bookingId: booking.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(company))
      .json({ reason: 'Provider cannot host', idempotencyKey: 'company-cancel-http-001' })
    cancelled.assertStatus(200)
    cancelled.assertBodyContains({ data: { status: 'requested', amountMinor: '9007199254740993' } })
  })

  test('company finance is tenant scoped and admin audit routes expose bounded metadata', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const first = await setup()
    const second = await setup()
    const admin = await createAdmin()
    await confirm(first.customer, first.booking, 'finance-audit-first')
    await confirm(second.customer, second.booking, 'finance-audit-second')
    const companyPayments = await client
      .visit('company_payments.index')
      .withGuard('api')
      .loginAs(first.owner, companyTokenAbilities(first.company))
    companyPayments.assertStatus(200)
    assert.lengthOf(companyPayments.body().data, 1)
    assert.equal(companyPayments.body().data[0].bookingId, first.booking.id)

    for (const route of [
      'admin_payments.index',
      'admin_payments.attempts',
      'admin_payments.webhooks',
      'admin_payments.refunds',
      'admin_payments.reconciliation',
    ] as const) {
      const response = await client.visit(route).withGuard('api').loginAs(admin)
      response.assertStatus(200)
      assert.isArray(response.body().data)
    }
    assert.lengthOf(await db.from('payments'), 2)
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
