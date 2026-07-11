import vine from '@vinejs/vine'

const operatingHour = vine.object({
  weekday: vine.number().min(0).max(6),
  opensAtLocal: vine.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  closesAtLocal: vine.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  endsNextDay: vine.boolean().optional(),
})

export const availabilityPolicyValidator = vine.create({
  mode: vine.enum(['hourly', 'session', 'full_day', 'multi_day'] as const),
  slotIncrementMinutes: vine.number().positive().max(1440),
  minimumDurationMinutes: vine.number().positive().max(10080),
  maximumDurationMinutes: vine.number().positive().max(44640),
  minimumNoticeMinutes: vine.number().min(0).max(525600),
  maximumAdvanceDays: vine.number().positive().max(730),
  preparationBufferMinutes: vine.number().min(0).max(10080),
  cleanupBufferMinutes: vine.number().min(0).max(10080),
  operatingHours: vine.array(operatingHour).maxLength(28),
})

export const exceptionValidator = vine.create({
  localDate: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: vine.enum(['closed', 'modified_hours', 'open_override'] as const),
  startsAtLocal: vine
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  endsAtLocal: vine
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  endsNextDay: vine.boolean().optional(),
  reason: vine.string().trim().maxLength(1000).optional(),
})

export const sessionValidator = vine.create({
  code: vine
    .string()
    .trim()
    .minLength(2)
    .maxLength(80)
    .regex(/^[a-z0-9_]+$/),
  name: vine.object({
    ar: vine.string().trim().minLength(2).maxLength(120).optional(),
    en: vine.string().trim().minLength(2).maxLength(120).optional(),
  }),
  weekday: vine.number().min(0).max(6),
  startsAtLocal: vine.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  endsAtLocal: vine.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  endsNextDay: vine.boolean().optional(),
  isActive: vine.boolean().optional(),
})

export const externalReservationValidator = vine.create({
  spaceId: vine.number().positive(),
  type: vine.enum([
    'external_confirmed',
    'external_hold',
    'maintenance',
    'closure',
    'internal_event',
  ] as const),
  startsAt: vine.string().trim(),
  endsAt: vine.string().trim(),
  timezone: vine.string().trim().maxLength(100),
  expiresAt: vine.string().trim().optional(),
  preparationBufferMinutes: vine.number().min(0).max(10080).optional(),
  cleanupBufferMinutes: vine.number().min(0).max(10080).optional(),
  internalNote: vine.string().trim().maxLength(2000).optional(),
})

export const availabilityRangeValidator = vine.create({
  from: vine.string().trim(),
  to: vine.string().trim(),
})
