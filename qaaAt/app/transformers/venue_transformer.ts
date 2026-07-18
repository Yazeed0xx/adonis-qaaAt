import { BaseTransformer } from '@adonisjs/core/transformers'
import type Venue from '#models/venue'

export default class VenueTransformer extends BaseTransformer<Venue> {
  toObject() {
    return {
      id: this.resource.id,
      companyId: this.resource.companyId,
      name: this.resource.displayName,
      nameAr: this.resource.nameAr,
      nameEn: this.resource.nameEn,
      city: this.resource.city,
      district: this.resource.district,
      street: this.resource.street,
      buildingNumber: this.resource.buildingNumber,
      postalCode: this.resource.postalCode,
      additionalNumber: this.resource.additionalNumber,
      accessInstructions: {
        ar: this.resource.accessInstructionsAr,
        en: this.resource.accessInstructionsEn,
      },
      parkingNotes: { ar: this.resource.parkingNotesAr, en: this.resource.parkingNotesEn },
      latitude: this.resource.latitude === null ? null : Number(this.resource.latitude),
      longitude: this.resource.longitude === null ? null : Number(this.resource.longitude),
      verificationStatus: this.resource.verificationStatus,
      timezone: this.resource.timezone,
      createdAt: this.resource.createdAt,
      updatedAt: this.resource.updatedAt,
    }
  }
}
