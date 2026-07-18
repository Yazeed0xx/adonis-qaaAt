import { DateTime } from 'luxon'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import paymentService from '#services/payment_service'
import fakeProvider from '#services/fake_payment_provider'
import { seedReferenceData } from '#database/seeding/reference_data'
import { createSpaceScenario, publishSpace } from '#tests/support/scenarios/spaces'

export async function setup() {
  await seedReferenceData()
  const scenario = await createSpaceScenario({
    space: publishSpace({
      nameEn: 'Payment Space',
      bookingMode: 'request_to_book',
      capacityTotal: 100,
    }),
  })
  const { user: owner, company, membership, space } = scenario
  const customer = await UserFactory.apply('user', 'verified').create()
  const start = DateTime.now()
    .plus({ days: 10 })
    .setZone('Asia/Riyadh')
    .startOf('day')
    .set({ hour: 10 })
  const booking = await db.transaction(async (trx) => {
    const [row] = await trx
      .table('bookings')
      .insert({
        user_id: customer.id,
        company_id: company.id,
        venue_id: space.venueId,
        space_id: space.id,
        request_reference: `PAY-${crypto.randomUUID()}`,
        space_name_snapshot_en: 'Payment Space',
        category_slug_snapshot: 'meeting_room',
        customer_name_snapshot: customer.userName ?? customer.email,
        customer_email_snapshot: customer.email,
        contact_preference: 'in_app',
        booking_date: start.toISODate(),
        start_time: '10:00',
        end_time: '12:00',
        starts_at: start.toUTC().toSQL(),
        ends_at: start.plus({ hours: 2 }).toUTC().toSQL(),
        original_start_local: start.toISO({ includeOffset: false }),
        original_end_local: start.plus({ hours: 2 }).toISO({ includeOffset: false }),
        original_timezone: 'Asia/Riyadh',
        submitted_at: new Date(),
        response_expires_at: DateTime.now().plus({ days: 2 }).toSQL(),
        status: 'accepted',
        total_price: '90071992547409.93',
        payment_status: 'unpaid',
        payment_due_date: DateTime.now().plus({ days: 2 }).toSQL(),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*')
    await trx.table('booking_holds').insert({
      company_id: company.id,
      space_id: space.id,
      booking_id: row.id,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      expires_at: DateTime.now().plus({ days: 2 }).toSQL(),
      created_at: new Date(),
    })
    const hold = await trx.from('booking_holds').where('booking_id', row.id).firstOrFail()
    await trx.table('space_inventory_blocks').insert({
      company_id: company.id,
      space_id: space.id,
      booking_hold_id: hold.id,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      blocked_from_at: row.starts_at,
      blocked_until_at: row.ends_at,
      created_at: new Date(),
    })
    return row
  })
  await paymentService.createPolicy(company.id, membership.id, {
    name: 'Standard',
    tiers: [{ minimumHours: 0, refundPercent: 50 }],
  })
  return { owner, company, membership, customer, booking }
}

interface PaymentAttemptContract {
  provider_attempt_reference: string
}

interface PaymentContract {
  expectedAmountMinor: string
}

interface RefundContract {
  provider_refund_reference: string
  reference: string
  approved_amount_minor: string | number
}

type PaymentScenario = Awaited<ReturnType<typeof setup>>

export function paymentEvent(
  attempt: PaymentAttemptContract,
  payment: PaymentContract,
  overrides: Record<string, unknown> = {}
) {
  return {
    eventId: `evt_${crypto.randomUUID()}`,
    eventType: 'payment.succeeded',
    reference: attempt.provider_attempt_reference,
    amountMinor: payment.expectedAmountMinor,
    currency: 'SAR',
    status: 'succeeded',
    occurredAt: new Date().toISOString(),
    ...overrides,
  }
}

export async function postRawWebhook(client: ApiClient, raw: string, signature: string) {
  return client
    .post('/api/payment-webhooks/fake')
    .header('x-qaaat-signature', signature)
    .unsafeJson(raw)
}

export async function confirm(
  customer: PaymentScenario['customer'],
  booking: PaymentScenario['booking'],
  key: string
) {
  const payment = await paymentService.initiate(customer.id, booking.id, key)
  const attempt = await db.from('payment_attempts').where('payment_id', payment.id).firstOrFail()
  const raw = Buffer.from(JSON.stringify(paymentEvent(attempt, payment)))
  await paymentService.processWebhook(raw, fakeProvider.sign(raw))
  return { payment, attempt }
}

export function refundEvent(refund: RefundContract, overrides: Record<string, unknown> = {}) {
  return {
    eventId: `evt_${crypto.randomUUID()}`,
    eventType: 'refund.succeeded',
    reference: refund.provider_refund_reference,
    internalCorrelationReference: refund.reference,
    amountMinor: String(refund.approved_amount_minor),
    currency: 'SAR',
    status: 'succeeded',
    occurredAt: new Date().toISOString(),
    ...overrides,
  }
}

export async function databaseError(operation: () => Promise<unknown>) {
  try {
    await operation()
  } catch (error) {
    return error as { code?: string }
  }
  return null
}

export async function attachDepositQuote(ctx: Awaited<ReturnType<typeof setup>>) {
  const [quote] = await db
    .table('quotes')
    .insert({
      reference: `Q-${crypto.randomUUID()}`,
      company_id: ctx.company.id,
      venue_id: ctx.booking.venue_id,
      space_id: ctx.booking.space_id,
      user_id: ctx.customer.id,
      created_by_membership_id: ctx.membership.id,
      booking_id: ctx.booking.id,
      status: 'draft',
      starts_at: ctx.booking.starts_at,
      ends_at: ctx.booking.ends_at,
      start_local: ctx.booking.original_start_local,
      end_local: ctx.booking.original_end_local,
      timezone: ctx.booking.original_timezone,
      created_at: new Date(),
    })
    .returning('*')
  const [revision] = await db
    .table('quote_revisions')
    .insert({
      quote_id: quote.id,
      company_id: ctx.company.id,
      revision_number: 1,
      status: 'draft',
      subtotal_minor: '10000',
      vat_minor: '0',
      total_minor: '10000',
      deposit_percent: 25,
      deposit_minor: '2500',
      remaining_minor: '7500',
      created_by_membership_id: ctx.membership.id,
      created_at: new Date(),
    })
    .returning('*')
  await db
    .from('quote_revisions')
    .where('id', revision.id)
    .update({
      status: 'sent',
      sent_by_membership_id: ctx.membership.id,
      sent_at: new Date(),
      expires_at: DateTime.now().plus({ day: 1 }).toSQL(),
    })
  await db.from('quotes').where('id', quote.id).update({
    status: 'accepted',
    current_revision_id: revision.id,
    accepted_revision_id: revision.id,
    accepted_at: new Date(),
  })
  await db.from('bookings').where('id', ctx.booking.id).update({
    accepted_quote_id: quote.id,
    accepted_quote_revision_id: revision.id,
    accepted_total_minor: '10000',
    total_price: '100.00',
  })
}
