import vine from '@vinejs/vine'

/**
 * Validator for creating a booking
 */
export const createBookingValidator = vine.compile(
  vine.object({
    hallId: vine.number().positive(),
    bookingDate: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
    startTime: vine.string().regex(/^\d{2}:\d{2}$/), // HH:MM format
    endTime: vine.string().regex(/^\d{2}:\d{2}$/), // HH:MM format
    serviceIds: vine.array(vine.number().positive()).optional(),
    specialRequests: vine.string().maxLength(1000).optional(),
  })
)

/**
 * Validator for rejecting a booking
 */
export const rejectBookingValidator = vine.compile(
  vine.object({
    reason: vine.string().minLength(10).maxLength(500),
  })
)
