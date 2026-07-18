/* eslint-disable @unicorn/no-await-expression-member */
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import CompanyMembership from '#models/company_membership'
import CompanyMembershipPermission from '#models/company_membership_permission'
import fakeProvider from '#services/fake_payment_provider'
import paymentService from '#services/payment_service'
import { withTruncateIsolation } from '#tests/support/database'
import { confirm, refundEvent, setup } from '#tests/support/scenarios/payments'

test.group('Refund retry HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)
  test('failed refund initiation is durable and an authorized idempotent retry can complete it', async ({
    client,
    assert,
  }) => {
    const { owner, customer, booking, company } = await setup()
    await confirm(customer, booking, 'payment-refund-retry')
    const original = fakeProvider.requestRefund.bind(fakeProvider)
    fakeProvider.requestRefund = async () => {
      throw new Error('provider unavailable')
    }
    try {
      await paymentService.cancelPaidBooking(
        'customer',
        customer.id,
        booking.id,
        'Retry required',
        'cancel-refund-retry'
      )
    } finally {
      fakeProvider.requestRefund = original
    }
    const refund = await db.from('refunds').firstOrFail()
    assert.equal(refund.status, 'failed')
    assert.equal((await db.from('refund_attempts').firstOrFail()).status, 'failed')
    const abilities = ['client:company_app', `company:${company.id}`]
    const retry = await client
      .visit('company_payments.retry_refund', { id: refund.id })
      .json({ idempotencyKey: 'refund-retry-company-1' })
      .withGuard('api')
      .loginAs(owner, abilities)
    retry.assertStatus(200)
    const retryAgain = await client
      .visit('company_payments.retry_refund', { id: refund.id })
      .json({ idempotencyKey: 'refund-retry-company-1' })
      .withGuard('api')
      .loginAs(owner, abilities)
    retryAgain.assertStatus(200)
    assert.lengthOf(await db.from('refund_attempts'), 2)
    const currentAttempt = await db.from('refund_attempts').orderBy('id', 'desc').firstOrFail()
    assert.equal(currentAttempt.status, 'provider_pending')
    assert.isString(currentAttempt.provider_refund_reference)
    const event = Buffer.from(
      JSON.stringify(refundEvent(refund, { reference: currentAttempt.provider_refund_reference }))
    )
    await paymentService.processWebhook(event, fakeProvider.sign(event))
    assert.equal(
      (await db.from('refunds').where('id', refund.id).firstOrFail()).status,
      'succeeded'
    )
    const finalized = await client
      .visit('company_payments.retry_refund', { id: refund.id })
      .json({ idempotencyKey: 'refund-retry-finalized' })
      .withGuard('api')
      .loginAs(owner, abilities)
    finalized.assertStatus(409)
    const customerRead = await client
      .visit('user_payments.refund', { id: refund.id })
      .withGuard('api')
      .loginAs(customer, ['client:customer_app'])
    customerRead.assertStatus(200)
    assert.equal(customerRead.body().data.status, 'succeeded')
    assert.lengthOf(customerRead.body().data.attempts, 2)
  })

  test('refund retry requires effective refunds.approve on an active tenant membership', async ({
    client,
  }) => {
    const { customer, booking, company } = await setup()
    await confirm(customer, booking, 'payment-refund-retry-rbac')
    const original = fakeProvider.requestRefund.bind(fakeProvider)
    fakeProvider.requestRefund = async () => {
      throw new Error('initial failure')
    }
    await paymentService.cancelPaidBooking(
      'customer',
      customer.id,
      booking.id,
      'RBAC retry',
      'cancel-refund-retry-rbac'
    )
    fakeProvider.requestRefund = original
    const refund = await db.from('refunds').firstOrFail()
    const employee = await UserFactory.apply('user', 'verified').create()
    const membership = await CompanyMembership.create({
      companyId: company.id,
      userId: employee.id,
      role: 'accountant',
      status: 'active',
      joinedAt: DateTime.now(),
    })
    const abilities = ['client:company_app', `company:${company.id}`]
    const retry = () =>
      client
        .visit('company_payments.retry_refund', { id: refund.id })
        .json({ idempotencyKey: `refund-rbac-${crypto.randomUUID()}` })
        .withGuard('api')
        .loginAs(employee, abilities)
    ;(await retry()).assertStatus(403)
    membership.role = 'manager'
    await membership.save()
    await CompanyMembershipPermission.create({
      companyMembershipId: membership.id,
      permission: 'refunds.approve',
      effect: 'deny',
    })
    ;(await retry()).assertStatus(403)
    await CompanyMembershipPermission.query().where('companyMembershipId', membership.id).delete()
    membership.status = 'revoked'
    await membership.save()
    ;(await retry()).assertStatus(403)
  })
})
