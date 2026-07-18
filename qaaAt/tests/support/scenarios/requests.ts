import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { createCustomer } from '#tests/support/actors'
import { createSpaceScenario, publishSpace } from '#tests/support/scenarios/spaces'

export async function createRequestWorkflowScenario() {
  const scenario = await createSpaceScenario({
    space: publishSpace({
      nameEn: 'Request workflow space',
      bookingMode: 'request_to_book',
      capacityTotal: 200,
    }),
  })
  const customer = await createCustomer()
  await db
    .table('category_request_response_policies')
    .insert({ category_id: scenario.category.id })
    .onConflict('category_id')
    .ignore()
  await db.table('space_availability_policies').insert({
    company_id: scenario.company.id,
    space_id: scenario.space.id,
    mode: 'hourly',
    slot_increment_minutes: 60,
    minimum_duration_minutes: 60,
    maximum_duration_minutes: 720,
    minimum_notice_minutes: 0,
    maximum_advance_days: 365,
    preparation_buffer_minutes: 0,
    cleanup_buffer_minutes: 0,
  })
  const [ratePlan] = await db
    .table('rate_plans')
    .insert({
      company_id: scenario.company.id,
      space_id: scenario.space.id,
      name_en: 'Default hourly rate',
      pricing_mode: 'hourly',
      price_minor: '10000',
      prices_include_vat: false,
      vat_rate_bps: 1500,
      minimum_duration_minutes: 60,
      maximum_duration_minutes: 720,
      is_active: true,
      created_at: new Date(),
    })
    .returning('*')
  await db.table('space_operating_hours').insert(
    Array.from({ length: 7 }, (_, weekday) => ({
      company_id: scenario.company.id,
      space_id: scenario.space.id,
      weekday,
      opens_at_local: '08:00',
      closes_at_local: '22:00',
      ends_next_day: false,
      sort_order: 0,
    }))
  )
  const day = DateTime.now().plus({ days: 10 }).setZone(scenario.venue.timezone).startOf('day')

  return {
    ...scenario,
    owner: scenario.user,
    customer,
    ratePlan,
    day,
    startsAt: day.set({ hour: 10 }).toISO()!,
    endsAt: day.set({ hour: 12 }).toISO()!,
  }
}

export async function createInquiryWorkflowScenario() {
  const scenario = await createRequestWorkflowScenario()
  scenario.space.bookingMode = 'quote_required'
  await scenario.space.save()
  return scenario
}

export function bookingRequestInput(
  spaceId: number,
  startsAt: string,
  endsAt: string,
  idempotencyKey: string
) {
  return {
    spaceId,
    startsAt,
    endsAt,
    eventType: 'wedding',
    attendance: 100,
    contactPreference: 'in_app' as const,
    idempotencyKey,
  }
}

export function inquiryInput(
  spaceId: number,
  startsAt: string,
  endsAt: string,
  idempotencyKey: string
) {
  return {
    spaceId,
    preferredStartsAt: startsAt,
    preferredEndsAt: endsAt,
    subject: 'هل الموعد متاح؟',
    eventType: 'wedding',
    attendance: 100,
    contactPreference: 'in_app' as const,
    idempotencyKey,
  }
}

export function visitInput(
  spaceId: number,
  startsAt: string,
  endsAt: string,
  idempotencyKey: string
) {
  return { spaceId, startsAt, endsAt, idempotencyKey }
}
