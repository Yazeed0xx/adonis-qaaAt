import { DateTime } from 'luxon'
import type { ModelAttributes } from '@adonisjs/lucid/types/model'
import { seedReferenceData } from '#database/seeding/reference_data'
import Space from '#models/space'
import SpaceCategory from '#models/space_category'
import Venue from '#models/venue'
import { createApprovedCompanyOwner, type CompanyOwnerActor } from '#tests/support/actors'

type VenueOverrides = Partial<ModelAttributes<Venue>>
type SpaceOverrides = Partial<ModelAttributes<Space>>

export interface SpaceScenario extends CompanyOwnerActor {
  venue: Venue
  category: SpaceCategory
  space: Space
}

export async function createVenueFixture(actor: CompanyOwnerActor, overrides: VenueOverrides = {}) {
  return Venue.create({
    companyId: actor.company.id,
    nameAr: 'مركز الرياض',
    nameEn: 'Riyadh Center',
    city: 'Riyadh',
    district: null,
    street: null,
    buildingNumber: null,
    postalCode: null,
    additionalNumber: null,
    accessInstructionsAr: null,
    accessInstructionsEn: null,
    parkingNotesAr: null,
    parkingNotesEn: null,
    latitude: null,
    longitude: null,
    verificationStatus: 'unverified',
    timezone: 'Asia/Riyadh',
    deletedAt: null,
    ...overrides,
  })
}

export async function createSpaceFixture(
  actor: CompanyOwnerActor,
  venue: Venue,
  category: SpaceCategory,
  overrides: SpaceOverrides = {}
) {
  return Space.create({
    companyId: actor.company.id,
    venueId: venue.id,
    categoryId: category.id,
    nameAr: null,
    nameEn: 'Test Space',
    descriptionAr: null,
    descriptionEn: null,
    bookingMode: 'request_to_book',
    publicationStatus: 'draft',
    capacityTotal: 20,
    requiresVisit: false,
    minimumDurationMinutes: null,
    maximumDurationMinutes: null,
    minimumNoticeHours: null,
    instantBookApprovedAt: null,
    instantBookApprovedBy: null,
    publishedAt: null,
    publishedBy: null,
    deletedAt: null,
    ...overrides,
  })
}

export async function createSpaceScenario(
  options: {
    categorySlug?: string
    venue?: VenueOverrides
    space?: SpaceOverrides
  } = {}
): Promise<SpaceScenario> {
  await seedReferenceData()
  const actor = await createApprovedCompanyOwner()
  const venue = await createVenueFixture(actor, options.venue)
  const category = await SpaceCategory.findByOrFail('slug', options.categorySlug ?? 'meeting_room')
  const space = await createSpaceFixture(actor, venue, category, options.space)

  return { ...actor, venue, category, space }
}

export function publishSpace(overrides: SpaceOverrides = {}): SpaceOverrides {
  return {
    publicationStatus: 'published',
    publishedAt: DateTime.fromISO('2026-07-17T12:00:00.000Z'),
    ...overrides,
  }
}
