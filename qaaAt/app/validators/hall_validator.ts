import vine from '@vinejs/vine'

/**
 * Validator for creating/updating a hall
 */
export const hallValidator = vine.compile(
  vine.object({
    name: vine.string(),
    description: vine.string().optional(),
    capacity: vine.number().min(1),
    location: vine.string(),
    amenities: vine.any().optional(),
    pricing: vine.number().min(0),
    images: vine.array(vine.string()).optional(),
    address: vine.string(),
    city: vine.string(),
    additionalServices: vine.any().optional(),
    additionalFeatures: vine.any().optional(),
    additionalAmenities: vine.any().optional(),
    additionalEquipments: vine.any().optional(),
    additionalFacilities: vine.any().optional(),
    isAvailable: vine.boolean().optional(),
  })
)
