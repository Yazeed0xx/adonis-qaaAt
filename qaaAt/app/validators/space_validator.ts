import vine from '@vinejs/vine'

const localizedText = vine.object({
  ar: vine.string().trim().minLength(2).maxLength(5000).optional(),
  en: vine.string().trim().minLength(2).maxLength(5000).optional(),
})

const eventDetails = vine.object({
  maleCapacity: vine.number().min(0).optional(),
  femaleCapacity: vine.number().min(0).optional(),
  hasSeparateEntrances: vine.boolean().optional(),
  hasBridalRoom: vine.boolean().optional(),
  hasStage: vine.boolean().optional(),
})

const layoutCapacity = vine.object({
  layout: vine.enum([
    'boardroom',
    'classroom',
    'theater',
    'u_shape',
    'banquet',
    'standing',
    'cabaret',
  ] as const),
  capacity: vine.number().positive(),
})

const largeFormatDetails = vine.object({
  floorAreaSqm: vine.number().positive().optional(),
  ceilingHeightM: vine.number().positive().optional(),
  hasLoadingAccess: vine.boolean().optional(),
  visitorCapacity: vine.number().positive().optional(),
  powerRequirement: vine.string().trim().maxLength(120).optional(),
})

export const createVenueValidator = vine.create({
  name: localizedText,
  city: vine.string().trim().minLength(2).maxLength(120),
  district: vine.string().trim().maxLength(120).optional(),
  street: vine.string().trim().maxLength(180).optional(),
  buildingNumber: vine.string().trim().maxLength(40).optional(),
  postalCode: vine.string().trim().maxLength(20).optional(),
  additionalNumber: vine.string().trim().maxLength(40).optional(),
  accessInstructions: localizedText.optional(),
  parkingNotes: localizedText.optional(),
  latitude: vine.number().min(-90).max(90).optional(),
  longitude: vine.number().min(-180).max(180).optional(),
  timezone: vine.string().trim().maxLength(100).optional(),
})

export const updateVenueValidator = vine.create({
  name: localizedText.optional(),
  city: vine.string().trim().minLength(2).maxLength(120).optional(),
  district: vine.string().trim().maxLength(120).optional(),
  street: vine.string().trim().maxLength(180).optional(),
  buildingNumber: vine.string().trim().maxLength(40).optional(),
  postalCode: vine.string().trim().maxLength(20).optional(),
  additionalNumber: vine.string().trim().maxLength(40).optional(),
  accessInstructions: localizedText.optional(),
  parkingNotes: localizedText.optional(),
  latitude: vine.number().min(-90).max(90).optional(),
  longitude: vine.number().min(-180).max(180).optional(),
  timezone: vine.string().trim().maxLength(100).optional(),
})

export const createSpaceValidator = vine.create({
  venueId: vine.number().positive(),
  category: vine.enum([
    'wedding_hall',
    'private_event_venue',
    'meeting_room',
    'training_room',
    'workshop_room',
    'seminar_space',
    'conference_space',
    'graduation_venue',
    'exhibition_space',
    'multipurpose_space',
  ] as const),
  name: localizedText,
  description: localizedText.optional(),
  bookingMode: vine.enum(['request_to_book', 'quote_required'] as const),
  capacityTotal: vine.number().positive(),
  requiresVisit: vine.boolean().optional(),
  minimumDurationMinutes: vine.number().positive().optional(),
  maximumDurationMinutes: vine.number().positive().optional(),
  minimumNoticeHours: vine.number().min(0).optional(),
  amenityIds: vine.array(vine.number().positive()).distinct().optional(),
  eventDetails: eventDetails.optional(),
  layoutCapacities: vine.array(layoutCapacity).distinct('layout').optional(),
  largeFormatDetails: largeFormatDetails.optional(),
})

export const updateSpaceValidator = vine.create({
  venueId: vine.number().positive().optional(),
  category: vine
    .enum([
      'wedding_hall',
      'private_event_venue',
      'meeting_room',
      'training_room',
      'workshop_room',
      'seminar_space',
      'conference_space',
      'graduation_venue',
      'exhibition_space',
      'multipurpose_space',
    ] as const)
    .optional(),
  name: localizedText.optional(),
  description: localizedText.optional(),
  bookingMode: vine.enum(['request_to_book', 'quote_required'] as const).optional(),
  capacityTotal: vine.number().positive().optional(),
  requiresVisit: vine.boolean().optional(),
  minimumDurationMinutes: vine.number().positive().optional(),
  maximumDurationMinutes: vine.number().positive().optional(),
  minimumNoticeHours: vine.number().min(0).optional(),
  amenityIds: vine.array(vine.number().positive()).distinct().optional(),
  eventDetails: eventDetails.optional(),
  layoutCapacities: vine.array(layoutCapacity).distinct('layout').optional(),
  largeFormatDetails: largeFormatDetails.optional(),
})

export const moderationReasonValidator = vine.create({
  reason: vine.string().trim().minLength(10).maxLength(2000),
})
