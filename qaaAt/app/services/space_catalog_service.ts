import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Venue from '#models/venue'
import Space from '#models/space'
import SpaceCategory from '#models/space_category'
import SpaceEventDetail from '#models/space_event_detail'
import SpaceLayoutCapacity from '#models/space_layout_capacity'
import SpaceLargeFormatDetail from '#models/space_large_format_detail'
import SpaceAmenity from '#models/space_amenity'
import SpaceException from '#exceptions/space_exception'

type Localized = { ar?: string; en?: string }
type EventDetails = {
  maleCapacity?: number
  femaleCapacity?: number
  hasSeparateEntrances?: boolean
  hasBridalRoom?: boolean
  hasStage?: boolean
}
type LayoutCapacity = { layout: string; capacity: number }
type LargeFormatDetails = {
  floorAreaSqm?: number
  ceilingHeightM?: number
  hasLoadingAccess?: boolean
  visitorCapacity?: number
  powerRequirement?: string
}
export interface VenueInput {
  name: Localized
  city: string
  district?: string
  street?: string
  buildingNumber?: string
  postalCode?: string
  additionalNumber?: string
  accessInstructions?: Localized
  parkingNotes?: Localized
  latitude?: number
  longitude?: number
  timezone?: string
}
export interface SpaceInput {
  venueId: number
  category: string
  name: Localized
  description?: Localized
  bookingMode: 'request_to_book' | 'quote_required'
  capacityTotal: number
  requiresVisit?: boolean
  minimumDurationMinutes?: number
  maximumDurationMinutes?: number
  minimumNoticeHours?: number
  amenityIds?: number[]
  eventDetails?: EventDetails
  layoutCapacities?: LayoutCapacity[]
  largeFormatDetails?: LargeFormatDetails
}

const eventCategories = new Set([
  'wedding_hall',
  'private_event_venue',
  'graduation_venue',
  'multipurpose_space',
])
const layoutCategories = new Set([
  'meeting_room',
  'training_room',
  'workshop_room',
  'seminar_space',
  'conference_space',
  'multipurpose_space',
])
const largeCategories = new Set([
  'conference_space',
  'graduation_venue',
  'exhibition_space',
  'multipurpose_space',
])

export class SpaceCatalogService {
  async listVenues(companyId: number, page = 1, limit = 20) {
    return Venue.query()
      .where('companyId', companyId)
      .whereNull('deletedAt')
      .preload('spaces', (query) => query.whereNull('deletedAt'))
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)
  }
  async getVenue(companyId: number, venueId: number) {
    return Venue.query()
      .where('id', venueId)
      .where('companyId', companyId)
      .whereNull('deletedAt')
      .preload('spaces', (query) => query.whereNull('deletedAt'))
      .firstOrFail()
  }

  async createVenue(companyId: number, input: VenueInput) {
    this.assertLocalized(input.name)
    this.assertTimezone(input.timezone ?? 'Asia/Riyadh')
    return Venue.create({
      companyId,
      nameAr: input.name.ar ?? null,
      nameEn: input.name.en ?? null,
      legacyName: null,
      city: input.city,
      district: input.district ?? null,
      street: input.street ?? null,
      buildingNumber: input.buildingNumber ?? null,
      postalCode: input.postalCode ?? null,
      additionalNumber: input.additionalNumber ?? null,
      legacyLocation: null,
      legacyAddress: null,
      accessInstructionsAr: input.accessInstructions?.ar ?? null,
      accessInstructionsEn: input.accessInstructions?.en ?? null,
      parkingNotesAr: input.parkingNotes?.ar ?? null,
      parkingNotesEn: input.parkingNotes?.en ?? null,
      latitude: input.latitude?.toString() ?? null,
      longitude: input.longitude?.toString() ?? null,
      verificationStatus: 'unverified',
      timezone: input.timezone ?? 'Asia/Riyadh',
    })
  }

  async updateVenue(companyId: number, venueId: number, input: Partial<VenueInput>) {
    const venue = await Venue.query()
      .where('id', venueId)
      .where('companyId', companyId)
      .whereNull('deletedAt')
      .firstOrFail()
    const mapped = await Space.query()
      .where('venueId', venue.id)
      .whereNotNull('legacyHallId')
      .first()
    if (mapped)
      throw new SpaceException(
        'Mapped legacy venues must be updated through the Hall API',
        'LEGACY_VENUE_READ_ONLY',
        409
      )
    if (input.name) this.assertLocalized(input.name)
    if (input.timezone && input.timezone !== venue.timezone) {
      this.assertTimezone(input.timezone)
      const futureRecords = await db
        .from('spaces')
        .where('venue_id', venue.id)
        .where((query) => {
          query
            .whereExists((subquery) =>
              subquery
                .from('space_operating_hours')
                .whereRaw('space_operating_hours.space_id = spaces.id')
            )
            .orWhereExists((subquery) =>
              subquery
                .from('external_reservations')
                .whereRaw('external_reservations.space_id = spaces.id')
                .where('ends_at', '>', DateTime.now().toSQL())
            )
            .orWhereExists((subquery) =>
              subquery
                .from('space_inventory_blocks')
                .whereRaw('space_inventory_blocks.space_id = spaces.id')
                .where('blocked_until_at', '>', DateTime.now().toSQL())
            )
        })
        .first()
      if (futureRecords)
        throw new SpaceException(
          'Timezone cannot change while future calendar records exist',
          'VENUE_TIMEZONE_MIGRATION_REQUIRED',
          409
        )
    }
    venue.merge({
      nameAr: input.name?.ar ?? venue.nameAr,
      nameEn: input.name?.en ?? venue.nameEn,
      city: input.city ?? venue.city,
      district: input.district ?? venue.district,
      street: input.street ?? venue.street,
      buildingNumber: input.buildingNumber ?? venue.buildingNumber,
      postalCode: input.postalCode ?? venue.postalCode,
      additionalNumber: input.additionalNumber ?? venue.additionalNumber,
      accessInstructionsAr: input.accessInstructions?.ar ?? venue.accessInstructionsAr,
      accessInstructionsEn: input.accessInstructions?.en ?? venue.accessInstructionsEn,
      parkingNotesAr: input.parkingNotes?.ar ?? venue.parkingNotesAr,
      parkingNotesEn: input.parkingNotes?.en ?? venue.parkingNotesEn,
      latitude: input.latitude?.toString() ?? venue.latitude,
      longitude: input.longitude?.toString() ?? venue.longitude,
      timezone: input.timezone ?? venue.timezone,
    })
    await venue.save()
    return venue
  }

  async listSpaces(companyId: number, page = 1, limit = 20) {
    return this.preload(
      Space.query()
        .where('companyId', companyId)
        .whereNull('deletedAt')
        .orderBy('createdAt', 'desc')
    ).paginate(page, limit)
  }
  async getSpace(companyId: number, spaceId: number) {
    return this.preload(
      Space.query().where('id', spaceId).where('companyId', companyId).whereNull('deletedAt')
    ).firstOrFail()
  }

  async createSpace(companyId: number, actorUserId: number, input: SpaceInput) {
    this.assertLocalized(input.name)
    this.assertCategoryDetails(input.category, input)
    return db.transaction(async (trx) => {
      await Venue.query({ client: trx })
        .where('id', input.venueId)
        .where('companyId', companyId)
        .whereNull('deletedAt')
        .firstOrFail()
      const category = await SpaceCategory.query({ client: trx })
        .where('slug', input.category)
        .where('isActive', true)
        .firstOrFail()
      const space = await Space.create(
        {
          companyId,
          venueId: input.venueId,
          categoryId: category.id,
          legacyHallId: null,
          nameAr: input.name.ar ?? null,
          nameEn: input.name.en ?? null,
          legacyName: null,
          descriptionAr: input.description?.ar ?? null,
          descriptionEn: input.description?.en ?? null,
          legacyDescription: null,
          bookingMode: input.bookingMode,
          publicationStatus: 'draft',
          capacityTotal: input.capacityTotal,
          requiresVisit: input.requiresVisit ?? false,
          legacyIsAvailable: null,
          minimumDurationMinutes: input.minimumDurationMinutes ?? null,
          maximumDurationMinutes: input.maximumDurationMinutes ?? null,
          minimumNoticeHours: input.minimumNoticeHours ?? null,
          instantBookApprovedAt: null,
          instantBookApprovedBy: null,
          publishedAt: null,
          publishedBy: null,
        },
        { client: trx }
      )
      await this.replaceDetails(trx, space.id, input.category, input)
      await this.event(trx, space, actorUserId, 'created', null, 'draft')
      return this.getSpaceWithClient(trx, companyId, space.id)
    })
  }

  async updateSpace(
    companyId: number,
    actorUserId: number,
    spaceId: number,
    input: Partial<SpaceInput>
  ) {
    return db.transaction(async (trx) => {
      const space = await Space.query({ client: trx })
        .where('id', spaceId)
        .where('companyId', companyId)
        .whereNull('deletedAt')
        .forUpdate()
        .firstOrFail()
      if (space.legacyHallId)
        throw new SpaceException(
          'Mapped legacy spaces must be updated through the Hall API',
          'LEGACY_SPACE_READ_ONLY',
          409
        )
      if (!['draft', 'changes_requested', 'published'].includes(space.publicationStatus))
        throw new SpaceException(
          'Only draft, changes-requested, or published spaces may be edited',
          'SPACE_EDIT_INVALID_STATE'
        )
      if (input.name) this.assertLocalized(input.name)
      if (input.venueId)
        await Venue.query({ client: trx })
          .where('id', input.venueId)
          .where('companyId', companyId)
          .whereNull('deletedAt')
          .firstOrFail()
      const currentCategory = await SpaceCategory.findOrFail(space.categoryId, { client: trx })
      const categorySlug = input.category ?? currentCategory.slug
      this.assertCategoryDetails(categorySlug, input)
      const category = input.category
        ? await SpaceCategory.query({ client: trx })
            .where('slug', input.category)
            .where('isActive', true)
            .firstOrFail()
        : currentCategory
      const previousStatus = space.publicationStatus
      const nextStatus = previousStatus === 'published' ? 'pending_review' : previousStatus
      space.useTransaction(trx)
      space.merge({
        venueId: input.venueId ?? space.venueId,
        categoryId: category.id,
        nameAr: input.name?.ar ?? space.nameAr,
        nameEn: input.name?.en ?? space.nameEn,
        descriptionAr: input.description?.ar ?? space.descriptionAr,
        descriptionEn: input.description?.en ?? space.descriptionEn,
        bookingMode: input.bookingMode ?? space.bookingMode,
        capacityTotal: input.capacityTotal ?? space.capacityTotal,
        requiresVisit: input.requiresVisit ?? space.requiresVisit,
        minimumDurationMinutes: input.minimumDurationMinutes ?? space.minimumDurationMinutes,
        maximumDurationMinutes: input.maximumDurationMinutes ?? space.maximumDurationMinutes,
        minimumNoticeHours: input.minimumNoticeHours ?? space.minimumNoticeHours,
        publicationStatus: nextStatus,
        publishedAt: previousStatus === 'published' ? null : space.publishedAt,
        publishedBy: previousStatus === 'published' ? null : space.publishedBy,
      })
      await space.save()
      await this.replaceDetails(trx, space.id, categorySlug, input)
      await this.event(
        trx,
        space,
        actorUserId,
        previousStatus === 'published' ? 'provider_edit_submitted_for_review' : 'updated',
        previousStatus,
        nextStatus
      )
      return this.getSpaceWithClient(trx, companyId, space.id)
    })
  }

  async submit(companyId: number, actorUserId: number, spaceId: number) {
    return this.transition(
      companyId,
      actorUserId,
      spaceId,
      ['draft', 'changes_requested'],
      'pending_review',
      'submitted'
    )
  }
  async archive(companyId: number, actorUserId: number, spaceId: number) {
    return db.transaction(async (trx) => {
      const space = await Space.query({ client: trx })
        .where('id', spaceId)
        .where('companyId', companyId)
        .whereNull('deletedAt')
        .forUpdate()
        .firstOrFail()
      if (space.legacyHallId)
        throw new SpaceException(
          'Mapped legacy spaces are archived through the Hall API',
          'LEGACY_SPACE_READ_ONLY'
        )
      if (
        !['draft', 'changes_requested', 'published', 'suspended'].includes(space.publicationStatus)
      )
        throw new SpaceException(
          'Space cannot be archived from its current state',
          'SPACE_ARCHIVE_INVALID_STATE'
        )
      const previous = space.publicationStatus
      space.useTransaction(trx)
      space.publicationStatus = 'archived'
      space.deletedAt = DateTime.now()
      await space.save()
      await this.event(trx, space, actorUserId, 'archived', previous, 'archived')
      return space
    })
  }

  async publicShow(spaceId: number) {
    const space = await this.preload(
      Space.query()
        .where('id', spaceId)
        .where('publicationStatus', 'published')
        .whereNull('deletedAt')
        .whereHas('company', (query) => query.where('status', 'approved').whereNull('deletedAt'))
        .where((query) => query.whereNull('legacyHallId').orWhere('legacyIsAvailable', true))
    ).first()
    if (!space) throw new SpaceException('Published space not found', 'SPACE_NOT_FOUND', 404)
    return space
  }

  private async transition(
    companyId: number,
    actorUserId: number,
    spaceId: number,
    from: string[],
    next: string,
    action: string
  ) {
    return db.transaction(async (trx) => {
      const space = await Space.query({ client: trx })
        .where('id', spaceId)
        .where('companyId', companyId)
        .whereNull('deletedAt')
        .forUpdate()
        .firstOrFail()
      if (space.legacyHallId)
        throw new SpaceException(
          'Mapped legacy publication is controlled by compatibility rules',
          'LEGACY_SPACE_READ_ONLY'
        )
      if (!from.includes(space.publicationStatus))
        throw new SpaceException('Invalid publication transition', 'SPACE_TRANSITION_INVALID_STATE')
      const previous = space.publicationStatus
      space.useTransaction(trx)
      space.publicationStatus = next
      await space.save()
      await this.event(trx, space, actorUserId, action, previous, next)
      return space
    })
  }

  private assertLocalized(value: Localized) {
    if (!value.ar && !value.en)
      throw new SpaceException(
        'At least one Arabic or English localized value is required',
        'LOCALIZED_VALUE_REQUIRED',
        422
      )
  }
  private assertTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
    } catch {
      throw new SpaceException('Unsupported IANA timezone', 'VENUE_TIMEZONE_INVALID', 422)
    }
  }
  private assertCategoryDetails(category: string, input: Partial<SpaceInput>) {
    if (input.eventDetails && !eventCategories.has(category))
      throw new SpaceException(
        'Event details are not valid for this category',
        'CATEGORY_DETAILS_INVALID',
        422
      )
    if (input.layoutCapacities && !layoutCategories.has(category))
      throw new SpaceException(
        'Layout capacities are not valid for this category',
        'CATEGORY_DETAILS_INVALID',
        422
      )
    if (input.largeFormatDetails && !largeCategories.has(category))
      throw new SpaceException(
        'Large-format details are not valid for this category',
        'CATEGORY_DETAILS_INVALID',
        422
      )
  }

  private async replaceDetails(
    trx: TransactionClientContract,
    spaceId: number,
    category: string,
    input: Partial<SpaceInput>
  ) {
    if (!eventCategories.has(category) || input.eventDetails !== undefined) {
      await SpaceEventDetail.query({ client: trx }).where('spaceId', spaceId).delete()
      if (eventCategories.has(category) && input.eventDetails)
        await SpaceEventDetail.create({ spaceId, ...input.eventDetails }, { client: trx })
    }
    if (!layoutCategories.has(category) || input.layoutCapacities !== undefined) {
      await SpaceLayoutCapacity.query({ client: trx }).where('spaceId', spaceId).delete()
      for (const item of layoutCategories.has(category) ? (input.layoutCapacities ?? []) : [])
        await SpaceLayoutCapacity.create(
          { spaceId, layout: item.layout, capacity: item.capacity },
          { client: trx }
        )
    }
    if (!largeCategories.has(category) || input.largeFormatDetails !== undefined) {
      await SpaceLargeFormatDetail.query({ client: trx }).where('spaceId', spaceId).delete()
      if (largeCategories.has(category) && input.largeFormatDetails)
        await SpaceLargeFormatDetail.create(
          {
            spaceId,
            floorAreaSqm: input.largeFormatDetails.floorAreaSqm?.toString() ?? null,
            ceilingHeightM: input.largeFormatDetails.ceilingHeightM?.toString() ?? null,
            hasLoadingAccess: input.largeFormatDetails.hasLoadingAccess ?? null,
            visitorCapacity: input.largeFormatDetails.visitorCapacity ?? null,
            powerRequirement: input.largeFormatDetails.powerRequirement ?? null,
          },
          { client: trx }
        )
    }
    if (input.amenityIds !== undefined) {
      await SpaceAmenity.query({ client: trx }).where('spaceId', spaceId).delete()
      if (input.amenityIds.length) {
        const valid = await trx
          .from('amenity_definitions')
          .whereIn('id', input.amenityIds)
          .where('is_active', true)
          .select('id')
        if (valid.length !== input.amenityIds.length)
          throw new SpaceException('One or more amenities are invalid', 'AMENITY_INVALID', 422)
        for (const amenityId of input.amenityIds)
          await SpaceAmenity.create({ spaceId, amenityDefinitionId: amenityId }, { client: trx })
      }
    }
  }

  private async event(
    trx: TransactionClientContract,
    space: Space,
    actorUserId: number | null,
    action: string,
    previousStatus: string | null,
    nextStatus: string,
    reason?: string
  ) {
    await trx.table('space_moderation_events').insert({
      space_id: space.id,
      company_id: space.companyId,
      actor_user_id: actorUserId,
      action,
      previous_status: previousStatus,
      next_status: nextStatus,
      reason: reason ?? null,
      created_at: DateTime.now().toSQL(),
    })
  }
  private preload(query: any): any {
    return query
      .preload('venue')
      .preload('category')
      .preload('eventDetails')
      .preload('layoutCapacities')
      .preload('largeFormatDetails')
      .preload('amenities', (amenities: any) => amenities.preload('amenityDefinition'))
      .preload('media', (media: any) => media.orderBy('sortOrder', 'asc'))
  }
  private getSpaceWithClient(trx: TransactionClientContract, companyId: number, spaceId: number) {
    return this.preload(
      Space.query({ client: trx }).where('id', spaceId).where('companyId', companyId)
    ).firstOrFail()
  }
}
