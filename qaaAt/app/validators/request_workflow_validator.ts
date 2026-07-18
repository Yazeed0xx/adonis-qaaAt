import vine from '@vinejs/vine'

const instant = vine.string().trim().maxLength(50)
const contact = vine.enum(['in_app', 'email', 'phone'] as const)

export const createSpaceBookingRequestValidator = vine.create({
  spaceId: vine.number().positive(),
  ratePlanId: vine.number().positive().optional(),
  startsAt: instant,
  endsAt: instant,
  sessionCode: vine.string().trim().maxLength(80).optional(),
  eventType: vine.string().trim().minLength(2).maxLength(80),
  attendance: vine.number().positive().max(100000),
  contactPreference: contact,
  notes: vine.string().trim().maxLength(2000).optional(),
  idempotencyKey: vine.string().trim().minLength(8).maxLength(120),
})

export const createDateInquiryValidator = vine.create({
  spaceId: vine.number().positive(),
  preferredStartsAt: instant,
  preferredEndsAt: instant,
  subject: vine.string().trim().minLength(3).maxLength(180),
  message: vine.string().trim().maxLength(2000).optional(),
  eventType: vine.string().trim().minLength(2).maxLength(80).optional(),
  attendance: vine.number().positive().max(100000).optional(),
  contactPreference: contact,
  idempotencyKey: vine.string().trim().minLength(8).maxLength(120),
})

export const createVisitRequestValidator = vine.create({
  spaceId: vine.number().positive(),
  startsAt: instant,
  endsAt: instant,
  notes: vine.string().trim().maxLength(2000).optional(),
  inquiryId: vine.number().positive().optional(),
  bookingId: vine.number().positive().optional(),
  idempotencyKey: vine.string().trim().minLength(8).maxLength(120),
})

export const requestReasonValidator = vine.create({
  reason: vine.string().trim().minLength(3).maxLength(1000),
  lockVersion: vine.number().positive().optional(),
})

export const inquiryResponseValidator = vine.create({
  message: vine.string().trim().minLength(1).maxLength(2000),
  lockVersion: vine.number().positive().optional(),
})

export const visitActionValidator = vine.create({
  reason: vine.string().trim().maxLength(1000).optional(),
  providerNotes: vine.string().trim().maxLength(4000).optional(),
  startsAt: instant.optional(),
  endsAt: instant.optional(),
  lockVersion: vine.number().positive().optional(),
})

export const requestSettingsValidator = vine.create({
  bookingResponseHours: vine.number().min(1).max(720).nullable().optional(),
  inquiryResponseHours: vine.number().min(1).max(720).nullable().optional(),
  visitResponseHours: vine.number().min(1).max(720).nullable().optional(),
  quoteHoldHours: vine.number().min(1).max(72).nullable().optional(),
})
