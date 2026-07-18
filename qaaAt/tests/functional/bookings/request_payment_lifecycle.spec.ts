import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import fakeProvider from '#services/fake_payment_provider'
import { withTruncateIsolation } from '#tests/support/database'
import { freezeTestTime } from '#tests/support/clock'
import {
  bookingRequestInput,
  createRequestWorkflowScenario,
} from '#tests/support/scenarios/requests'
import { paymentEvent, postRawWebhook } from '#tests/support/scenarios/payments'
import { responseId, responseResource } from '#tests/support/responses'

test.group('Request-to-book payment lifecycle', (group) => {
  group.each.setup(withTruncateIsolation)

  test('server-priced request proceeds through approval and verified payment confirmation', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createRequestWorkflowScenario()

    const rateResponse = await client
      .visit('company_pricing.store_rate_plan')
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
      .json({
        spaceId: scenario.space.id,
        nameEn: 'Hourly room rental',
        pricingMode: 'hourly',
        priceMinor: '10000',
        pricesIncludeVat: false,
        vatRateBps: 1500,
        minimumDurationMinutes: 60,
        maximumDurationMinutes: 720,
        isActive: true,
      })
    rateResponse.assertStatus(201)
    const ratePlan = responseResource(rateResponse.body()) as { id: number }

    const policyResponse = await client
      .visit('company_payments.store_policy')
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
      .json({
        name: 'Standard cancellation policy',
        depositNonRefundable: false,
        tiers: [{ minimumHours: 0, refundPercent: 50 }],
      })
    policyResponse.assertStatus(201)

    const requestResponse = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(scenario.customer)
      .json({
        ...bookingRequestInput(
          scenario.space.id,
          scenario.startsAt,
          scenario.endsAt,
          'request-payment-lifecycle-001'
        ),
        ratePlanId: ratePlan.id,
      })
    requestResponse.assertStatus(201)
    const bookingId = responseId(requestResponse.body())

    await db.from('rate_plans').where('id', ratePlan.id).update({ price_minor: '99999' })
    const storedPricingSnapshot = await db
      .from('booking_pricing_snapshots')
      .where('booking_id', bookingId)
      .firstOrFail()
    assert.equal(String(storedPricingSnapshot.total_minor), '23000')

    const approvalResponse = await client
      .visit('company_requests.approve_booking', { id: bookingId })
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
    approvalResponse.assertStatus(200)

    const payableResponse = await client
      .visit('user_payments.payable', { bookingId })
      .withGuard('api')
      .loginAs(scenario.customer)
    payableResponse.assertStatus(200)
    payableResponse.assertBodyContains({
      data: {
        bookingId,
        purpose: 'full_payment',
        payableAmountMinor: '23000',
        bookingTotalMinor: '23000',
        remainingBalanceMinor: '0',
        pricesIncludeVat: false,
        vatRateBps: 1500,
        vatMinor: '3000',
        lineItems: [
          {
            itemType: 'rate_plan',
            sourceId: ratePlan.id,
            totalMinor: '23000',
          },
        ],
      },
    })

    const initiationResponse = await client
      .visit('user_payments.initiate', { bookingId })
      .withGuard('api')
      .loginAs(scenario.customer)
      .json({ idempotencyKey: 'request-payment-initiation-001' })
    initiationResponse.assertStatus(200)
    const payment = responseResource(initiationResponse.body()) as {
      id: string
      expectedAmountMinor: string
    }
    assert.equal(payment.expectedAmountMinor, '23000')

    const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
    const rawEvent = JSON.stringify(paymentEvent(attempt, payment))
    const webhookResponse = await postRawWebhook(
      client,
      rawEvent,
      fakeProvider.sign(Buffer.from(rawEvent))
    )
    webhookResponse.assertStatus(200)

    const booking = await db.from('bookings').where('id', bookingId).firstOrFail()
    assert.equal(booking.status, 'confirmed')
    assert.equal(booking.payment_status, 'paid')

    const pricingSnapshot = await db
      .from('booking_pricing_snapshots')
      .where('booking_id', bookingId)
      .firstOrFail()
    assert.equal(String(pricingSnapshot.total_minor), '23000')
    assert.deepEqual(pricingSnapshot.line_items, [
      {
        itemType: 'rate_plan',
        sourceId: ratePlan.id,
        descriptionAr: null,
        descriptionEn: 'Hourly room rental',
        quantity: 120,
        quantityUnit: 'minute',
        unitPriceMinor: '10000',
        unitPriceBasis: 'hour',
        subtotalMinor: '20000',
        discountMinor: '0',
        vatRateBps: 1500,
        vatMinor: '3000',
        totalMinor: '23000',
        pricesIncludeVat: false,
      },
    ])

    const receipt = await db
      .from('booking_invoice_snapshots')
      .where('booking_id', bookingId)
      .firstOrFail()
    assert.deepEqual(receipt.snapshot.lineItems, pricingSnapshot.line_items)
  })

  test('ambiguous pricing requires an explicit server-owned rate plan', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createRequestWorkflowScenario()
    await db.table('rate_plans').insert({
      company_id: scenario.company.id,
      space_id: scenario.space.id,
      name_en: 'Second hourly rate',
      pricing_mode: 'hourly',
      price_minor: '15000',
      prices_include_vat: true,
      vat_rate_bps: 1500,
      minimum_duration_minutes: 60,
      maximum_duration_minutes: 720,
      is_active: true,
      created_at: new Date(),
    })

    const response = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(scenario.customer)
      .json(
        bookingRequestInput(
          scenario.space.id,
          scenario.startsAt,
          scenario.endsAt,
          'request-payment-ambiguous-001'
        )
      )

    response.assertStatus(422)
    response.assertBodyContains({ error: { code: 'BOOKING_RATE_PLAN_REQUIRED' } })
    assert.lengthOf(await db.from('bookings'), 0)
    assert.lengthOf(await db.from('booking_pricing_snapshots'), 0)
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
