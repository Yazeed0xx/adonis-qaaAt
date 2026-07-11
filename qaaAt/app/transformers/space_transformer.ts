import { BaseTransformer } from '@adonisjs/core/transformers'
import type Space from '#models/space'
import VenueTransformer from '#transformers/venue_transformer'

export default class SpaceTransformer extends BaseTransformer<Space> {
  toObject() {
    const event = this.resource.eventDetails
    const large = this.resource.largeFormatDetails
    return {
      id: this.resource.id,
      companyId: this.resource.companyId,
      venueId: this.resource.venueId,
      name: this.resource.displayName,
      nameAr: this.resource.nameAr,
      nameEn: this.resource.nameEn,
      description: this.resource.displayDescription,
      descriptionAr: this.resource.descriptionAr,
      descriptionEn: this.resource.descriptionEn,
      category: this.whenLoaded(this.resource.category)
        ? {
            slug: this.resource.category.slug,
            nameAr: this.resource.category.nameAr,
            nameEn: this.resource.category.nameEn,
          }
        : undefined,
      bookingMode: this.resource.bookingMode,
      publicationStatus: this.resource.publicationStatus,
      capacityTotal: this.resource.capacityTotal,
      requiresVisit: this.resource.requiresVisit,
      minimumDurationMinutes: this.resource.minimumDurationMinutes,
      maximumDurationMinutes: this.resource.maximumDurationMinutes,
      minimumNoticeHours: this.resource.minimumNoticeHours,
      legacyHallId: this.resource.legacyHallId,
      legacyIsAvailable: this.resource.legacyIsAvailable,
      venue: VenueTransformer.transform(this.whenLoaded(this.resource.venue)),
      eventDetails: event
        ? {
            maleCapacity: event.maleCapacity,
            femaleCapacity: event.femaleCapacity,
            hasSeparateEntrances: event.hasSeparateEntrances,
            hasBridalRoom: event.hasBridalRoom,
            hasStage: event.hasStage,
          }
        : undefined,
      layoutCapacities: this.resource.layoutCapacities?.map((item) => ({
        layout: item.layout,
        capacity: item.capacity,
      })),
      largeFormatDetails: large
        ? {
            floorAreaSqm: large.floorAreaSqm === null ? null : Number(large.floorAreaSqm),
            ceilingHeightM: large.ceilingHeightM === null ? null : Number(large.ceilingHeightM),
            hasLoadingAccess: large.hasLoadingAccess,
            visitorCapacity: large.visitorCapacity,
            powerRequirement: large.powerRequirement,
          }
        : undefined,
      amenities: this.resource.amenities?.map((item) => ({
        id: item.amenityDefinition.id,
        slug: item.amenityDefinition.slug,
        nameAr: item.amenityDefinition.nameAr,
        nameEn: item.amenityDefinition.nameEn,
      })),
      media: this.resource.media
        ?.filter((item) => item.moderationStatus === 'approved')
        .map((item) => ({
          id: item.id,
          type: item.mediaType,
          storageKey: item.provenance === 'controlled_storage' ? item.storageKey : undefined,
          legacyReference: item.provenance === 'legacy_imported' ? item.legacyReference : undefined,
          provenance: item.provenance,
          altTextAr: item.altTextAr,
          altTextEn: item.altTextEn,
          sortOrder: item.sortOrder,
          isCover: item.isCover,
        })),
      createdAt: this.resource.createdAt,
      updatedAt: this.resource.updatedAt,
    }
  }
}
