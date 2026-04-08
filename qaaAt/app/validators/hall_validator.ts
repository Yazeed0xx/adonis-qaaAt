import vine from '@vinejs/vine'

export const createHallValidator = vine.compile(
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
    services: vine.array(vine.string()).optional(),
    isAvailable: vine.boolean().optional(),
  })
)

export const updateHallValidator = vine.compile(
  vine.object({
    name: vine.string().optional(),
    description: vine.string().optional(),
    capacity: vine.number().min(1).optional(),
    location: vine.string().optional(),
    amenities: vine.any().optional(),
    pricing: vine.number().min(0).optional(),
    images: vine.array(vine.string()).optional(),
    address: vine.string().optional(),
    city: vine.string().optional(),
    services: vine.array(vine.string()).optional(),
    isAvailable: vine.boolean().optional(),
  })
)
