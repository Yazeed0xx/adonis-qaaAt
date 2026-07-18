import type { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import InventoryException from '#exceptions/inventory_exception'

const PG_BIGINT_MAX = 9_223_372_036_854_775_807n

const fail = (message: string, code: string, status = 422): never => {
  throw new InventoryException(message, code, status)
}

const bounded = (value: bigint) => {
  if (value < 0n || value > PG_BIGINT_MAX)
    fail('Booking monetary value is outside the supported range', 'BOOKING_AMOUNT_INVALID')
  return value
}

const roundHalfUp = (numerator: bigint, denominator: bigint) => {
  if (numerator < 0n || denominator <= 0n)
    fail('Booking monetary value is invalid', 'BOOKING_AMOUNT_INVALID')
  return bounded((numerator + denominator / 2n) / denominator)
}

const automaticModes = ['hourly', 'fixed_session', 'half_day', 'full_day', 'package'] as const
type AutomaticPricingMode = (typeof automaticModes)[number]

interface ResolveBookingPricingInput {
  companyId: number
  spaceId: number
  ratePlanId?: number
  startsAt: DateTime
  endsAt: DateTime
  sessionCode?: string
}

export interface BookingPricingSnapshot {
  companyId: number
  spaceId: number
  ratePlanId: number
  pricingMode: AutomaticPricingMode
  lineItems: Array<Record<string, unknown>>
  subtotalMinor: string
  discountMinor: string
  vatMinor: string
  totalMinor: string
  pricesIncludeVat: boolean
  vatRateBps: number
  currency: 'SAR'
}

export class BookingPricingService {
  async resolve(
    client: TransactionClientContract,
    input: ResolveBookingPricingInput
  ): Promise<BookingPricingSnapshot> {
    const policy = await client
      .from('space_availability_policies')
      .where({ space_id: input.spaceId, company_id: input.companyId })
      .firstOrFail()

    const query = client
      .from('rate_plans')
      .where({ company_id: input.companyId, space_id: input.spaceId, is_active: true })
      .whereNull('archived_at')

    if (input.ratePlanId) query.where('id', input.ratePlanId)
    else this.scopeCompatiblePlan(query, policy.mode, input.sessionCode)

    const plans = await query.orderBy('id').limit(2)
    if (!plans.length)
      fail('No active rate plan matches this booking request', 'BOOKING_RATE_PLAN_UNAVAILABLE', 409)
    if (plans.length > 1)
      fail('Select one of the available rate plans', 'BOOKING_RATE_PLAN_REQUIRED', 422)

    const plan = plans[0]
    if (!automaticModes.includes(plan.pricing_mode as AutomaticPricingMode))
      fail('This rate plan requires a quote', 'BOOKING_RATE_PLAN_REQUIRES_QUOTE', 409)
    this.assertCompatibility(plan, policy.mode, input)

    const durationMinutes = Math.round(input.endsAt.diff(input.startsAt, 'minutes').minutes)
    if (durationMinutes <= 0) fail('Booking end must follow its start', 'REQUEST_TIME_INVALID', 422)

    const unitPrice = bounded(BigInt(String(plan.price_minor)))
    const pricingMode = plan.pricing_mode as AutomaticPricingMode
    const subtotal =
      pricingMode === 'hourly' ? roundHalfUp(unitPrice * BigInt(durationMinutes), 60n) : unitPrice
    const vatRate = BigInt(plan.vat_rate_bps)
    const pricesIncludeVat = Boolean(plan.prices_include_vat)
    const vat = pricesIncludeVat
      ? roundHalfUp(subtotal * vatRate, 10_000n + vatRate)
      : roundHalfUp(subtotal * vatRate, 10_000n)
    const total = bounded(pricesIncludeVat ? subtotal : subtotal + vat)
    const quantity = pricingMode === 'hourly' ? durationMinutes : 1
    const quantityUnit = pricingMode === 'hourly' ? 'minute' : 'booking'
    const unitPriceBasis = pricingMode === 'hourly' ? 'hour' : 'booking'

    return {
      companyId: input.companyId,
      spaceId: input.spaceId,
      ratePlanId: plan.id,
      pricingMode,
      lineItems: [
        {
          itemType: 'rate_plan',
          sourceId: plan.id,
          descriptionAr: plan.name_ar,
          descriptionEn: plan.name_en,
          quantity,
          quantityUnit,
          unitPriceMinor: unitPrice.toString(),
          unitPriceBasis,
          subtotalMinor: subtotal.toString(),
          discountMinor: '0',
          vatRateBps: Number(vatRate),
          vatMinor: vat.toString(),
          totalMinor: total.toString(),
          pricesIncludeVat,
        },
      ],
      subtotalMinor: subtotal.toString(),
      discountMinor: '0',
      vatMinor: vat.toString(),
      totalMinor: total.toString(),
      pricesIncludeVat,
      vatRateBps: Number(vatRate),
      currency: 'SAR',
    }
  }

  async persist(
    client: TransactionClientContract,
    bookingId: number,
    snapshot: BookingPricingSnapshot
  ) {
    await client.table('booking_pricing_snapshots').insert({
      booking_id: bookingId,
      company_id: snapshot.companyId,
      space_id: snapshot.spaceId,
      rate_plan_id: snapshot.ratePlanId,
      pricing_mode: snapshot.pricingMode,
      line_items: JSON.stringify(snapshot.lineItems),
      subtotal_minor: snapshot.subtotalMinor,
      discount_minor: snapshot.discountMinor,
      vat_minor: snapshot.vatMinor,
      total_minor: snapshot.totalMinor,
      prices_include_vat: snapshot.pricesIncludeVat,
      vat_rate_bps: snapshot.vatRateBps,
      currency: snapshot.currency,
      created_at: new Date(),
    })
  }

  private scopeCompatiblePlan(query: any, availabilityMode: string, sessionCode?: string) {
    if (availabilityMode === 'hourly') query.where('pricing_mode', 'hourly')
    else if (availabilityMode === 'session')
      query.where('pricing_mode', 'fixed_session').where('session_code', sessionCode)
    else if (availabilityMode === 'full_day') query.where('pricing_mode', 'full_day')
    else
      fail(
        'Select an explicit rate plan for this availability mode',
        'BOOKING_RATE_PLAN_REQUIRED',
        422
      )
  }

  private assertCompatibility(
    plan: any,
    availabilityMode: string,
    input: ResolveBookingPricingInput
  ) {
    if (plan.pricing_mode === 'hourly' && availabilityMode !== 'hourly')
      fail('Rate plan does not match Space availability', 'BOOKING_RATE_PLAN_MISMATCH')
    if (
      plan.pricing_mode === 'fixed_session' &&
      (availabilityMode !== 'session' ||
        !input.sessionCode ||
        plan.session_code !== input.sessionCode)
    )
      fail('Rate plan does not match the selected session', 'BOOKING_RATE_PLAN_MISMATCH')
    if (plan.pricing_mode === 'full_day' && !['full_day', 'multi_day'].includes(availabilityMode))
      fail('Rate plan does not match Space availability', 'BOOKING_RATE_PLAN_MISMATCH')

    const durationMinutes = Math.round(input.endsAt.diff(input.startsAt, 'minutes').minutes)
    if (plan.minimum_duration_minutes && durationMinutes < plan.minimum_duration_minutes)
      fail('Booking is shorter than the rate plan minimum', 'BOOKING_RATE_PLAN_MISMATCH')
    if (plan.maximum_duration_minutes && durationMinutes > plan.maximum_duration_minutes)
      fail('Booking is longer than the rate plan maximum', 'BOOKING_RATE_PLAN_MISMATCH')
    if (plan.fixed_duration_minutes && durationMinutes !== plan.fixed_duration_minutes)
      fail('Booking duration does not match the rate plan', 'BOOKING_RATE_PLAN_MISMATCH')
  }
}

export default new BookingPricingService()
