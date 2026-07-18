import { seedReferenceData } from '#database/seeding/reference_data'
import db from '@adonisjs/lucid/services/db'
import { createSpaceScenario, publishSpace } from '#tests/support/scenarios/spaces'

export async function createAvailabilityScenario() {
  await seedReferenceData()
  const scenario = await createSpaceScenario({
    space: publishSpace({
      nameEn: 'Inventory Space',
      bookingMode: 'request_to_book',
      capacityTotal: 100,
    }),
  })
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

  return {
    owner: scenario.user,
    company: scenario.company,
    membership: scenario.membership,
    space: scenario.space,
  }
}
