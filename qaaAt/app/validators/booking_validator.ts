import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

const validBookingDate = vine.createRule((value, _, field) => {
  if (typeof value !== 'string') return
  const date = DateTime.fromFormat(value, 'yyyy-MM-dd', { locale: 'en' })
  if (!date.isValid || date.toFormat('yyyy-MM-dd') !== value) {
    field.report('The {{ field }} field must be a valid date in YYYY-MM-DD format', 'date', field)
  }
})

const validBookingTime = vine.createRule((value, _, field) => {
  if (typeof value !== 'string') return
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    field.report('The {{ field }} field must be a valid time in HH:MM format', 'time', field)
  }
})

/**
 * Validator for creating a booking
 */
export const createBookingValidator = vine.create({
  hallId: vine.number().positive(),
  bookingDate: vine.string().use(validBookingDate()),
  startTime: vine.string().use(validBookingTime()),
  endTime: vine.string().use(validBookingTime()),
  serviceIds: vine.array(vine.number().positive()).optional(),
  specialRequests: vine.string().maxLength(1000).optional(),
})

/**
 * Validator for rejecting a booking
 */
export const rejectBookingValidator = vine.compile(
  vine.object({
    reason: vine.string().minLength(10).maxLength(500),
  })
)
