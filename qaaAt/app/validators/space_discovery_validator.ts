import vine from '@vinejs/vine'

export const spaceDiscoveryValidator = vine.create({
  q: vine.string().trim().maxLength(120).optional(),
  category: vine.string().trim().maxLength(80).optional(),
  city: vine.string().trim().maxLength(120).optional(),
  capacity: vine.number().positive().max(1000000).withoutDecimals().optional(),
  amenities: vine.string().trim().maxLength(500).optional(),
  bookingMode: vine.enum(['request_to_book', 'quote_required', 'instant_book'] as const).optional(),
  pricingMode: vine
    .enum(['hourly', 'fixed_session', 'half_day', 'full_day', 'package', 'custom_quote'] as const)
    .optional(),
  minimumPriceMinor: vine
    .string()
    .regex(/^(?:0|[1-9]\d{0,18})$/)
    .optional(),
  maximumPriceMinor: vine
    .string()
    .regex(/^(?:0|[1-9]\d{0,18})$/)
    .optional(),
  from: vine.string().trim().optional(),
  to: vine.string().trim().optional(),
  sessionCode: vine
    .string()
    .trim()
    .maxLength(80)
    .regex(/^[a-z0-9_]+$/)
    .optional(),
  sort: vine
    .enum(['relevance', 'newest', 'capacity', 'price_asc', 'price_desc'] as const)
    .optional(),
  page: vine.number().positive().max(10000).withoutDecimals().optional(),
  limit: vine.number().positive().max(50).withoutDecimals().optional(),
})
