import vine from '@vinejs/vine'

const localizedName = {
  nameAr: vine.string().trim().minLength(1).maxLength(180).optional(),
  nameEn: vine.string().trim().minLength(1).maxLength(180).optional(),
}
const money = vine
  .string()
  .trim()
  .regex(/^(0|[1-9][0-9]{0,18})$/)

export const ratePlanValidator = vine.create({
  spaceId: vine.number().positive(),
  ...localizedName,
  pricingMode: vine.enum([
    'hourly',
    'fixed_session',
    'half_day',
    'full_day',
    'package',
    'custom_quote',
  ] as const),
  priceMinor: money.nullable().optional(),
  pricesIncludeVat: vine.boolean(),
  vatRateBps: vine.number().min(0).max(10000).withoutDecimals(),
  minimumDurationMinutes: vine.number().positive().max(10080).withoutDecimals().optional(),
  maximumDurationMinutes: vine.number().positive().max(10080).withoutDecimals().optional(),
  fixedDurationMinutes: vine.number().positive().max(10080).withoutDecimals().optional(),
  sessionCode: vine.string().trim().maxLength(80).optional(),
  isActive: vine.boolean().optional(),
})

export const serviceOptionValidator = vine.create({
  ...localizedName,
  descriptionAr: vine.string().trim().maxLength(2000).optional(),
  descriptionEn: vine.string().trim().maxLength(2000).optional(),
  priceMinor: money,
  pricesIncludeVat: vine.boolean(),
  vatRateBps: vine.number().min(0).max(10000).withoutDecimals(),
  isActive: vine.boolean().optional(),
})

export const attachServiceValidator = vine.create({
  serviceOptionId: vine.number().positive(),
  isActive: vine.boolean().optional(),
})

export const packageValidator = vine.create({
  spaceId: vine.number().positive(),
  ...localizedName,
  descriptionAr: vine.string().trim().maxLength(2000).optional(),
  descriptionEn: vine.string().trim().maxLength(2000).optional(),
  basePriceMinor: money,
  pricesIncludeVat: vine.boolean(),
  vatRateBps: vine.number().min(0).max(10000).withoutDecimals(),
  isActive: vine.boolean().optional(),
  items: vine
    .array(
      vine.object({
        serviceOptionId: vine.number().positive().optional(),
        itemType: vine.enum([
          'hall_rental',
          'hospitality',
          'seating',
          'bridal_room',
          'stage',
          'equipment',
          'staffing',
          'setup',
          'teardown',
          'service',
        ] as const),
        descriptionAr: vine.string().trim().maxLength(240).optional(),
        descriptionEn: vine.string().trim().maxLength(240).optional(),
        quantity: vine.number().positive().max(100000).withoutDecimals(),
        isIncluded: vine.boolean(),
      })
    )
    .maxLength(100),
})

const quoteItem = vine.object({
  sourceType: vine.enum(['rate_plan', 'package', 'service', 'adjustment'] as const),
  sourceId: vine.number().positive().optional(),
  descriptionAr: vine.string().trim().maxLength(240).optional(),
  descriptionEn: vine.string().trim().maxLength(240).optional(),
  quantity: vine.number().positive().max(100000).withoutDecimals(),
  unitPriceMinor: money.optional(),
  discountMinor: money.optional(),
})

export const createQuoteValidator = vine.create({
  inquiryId: vine.number().positive(),
  visitRequestId: vine.number().positive().optional(),
  internalNotes: vine.string().trim().maxLength(4000).optional(),
  pricesIncludeVat: vine.boolean(),
  vatRateBps: vine.number().min(0).max(10000).withoutDecimals(),
  depositPercent: vine.number().min(0).max(100).withoutDecimals().optional(),
  items: vine.array(quoteItem).minLength(1).maxLength(100),
})

export const updateQuoteValidator = vine.create({
  internalNotes: vine.string().trim().maxLength(4000).optional(),
  pricesIncludeVat: vine.boolean(),
  vatRateBps: vine.number().min(0).max(10000).withoutDecimals(),
  depositPercent: vine.number().min(0).max(100).withoutDecimals().optional(),
  items: vine.array(quoteItem).minLength(1).maxLength(100),
})

export const sendQuoteValidator = vine.create({
  expiresInHours: vine.number().min(1).max(720).withoutDecimals(),
})

export const quoteActionValidator = vine.create({
  revisionId: vine.number().positive().optional(),
  reason: vine.string().trim().minLength(3).maxLength(1000).optional(),
})
