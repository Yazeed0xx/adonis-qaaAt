import vine from '@vinejs/vine'

const pagination = {
  page: vine.number().positive().withoutDecimals().optional(),
  limit: vine.number().positive().withoutDecimals().max(100).optional(),
}

export const adminResourceParamsValidator = vine.create({
  id: vine.number().positive().withoutDecimals(),
})

export const adminCatalogUpdateCategoryValidator = vine.create({
  nameAr: vine.string().trim().minLength(2).maxLength(120).optional(),
  nameEn: vine.string().trim().minLength(2).maxLength(120).optional(),
  isActive: vine.boolean().optional(),
  sortOrder: vine.number().withoutDecimals().min(0).max(10_000).optional(),
})

export const adminCatalogCreateAmenityValidator = vine.create({
  slug: vine
    .string()
    .trim()
    .minLength(2)
    .maxLength(80)
    .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
  nameAr: vine.string().trim().minLength(2).maxLength(120),
  nameEn: vine.string().trim().minLength(2).maxLength(120),
  group: vine.string().trim().minLength(2).maxLength(80),
  isSearchable: vine.boolean().optional(),
  isActive: vine.boolean().optional(),
})

export const adminCatalogUpdateAmenityValidator = vine.create({
  nameAr: vine.string().trim().minLength(2).maxLength(120).optional(),
  nameEn: vine.string().trim().minLength(2).maxLength(120).optional(),
  group: vine.string().trim().minLength(2).maxLength(80).optional(),
  isSearchable: vine.boolean().optional(),
  isActive: vine.boolean().optional(),
})

export const adminAuditQueryValidator = vine.create({
  scope: vine.enum(['admin', 'company', 'booking'] as const),
  action: vine.string().trim().maxLength(100).optional(),
  targetType: vine.string().trim().maxLength(80).optional(),
  targetId: vine.number().positive().withoutDecimals().optional(),
  companyId: vine.number().positive().withoutDecimals().optional(),
  actorUserId: vine.number().positive().withoutDecimals().optional(),
  ...pagination,
})

export const adminDisputeCreateValidator = vine.create({
  paymentId: vine.number().positive().withoutDecimals(),
  refundId: vine.number().positive().withoutDecimals().optional(),
  reason: vine.string().trim().minLength(10).maxLength(2_000),
})

export const adminDisputeTransitionValidator = vine.create({
  status: vine.enum(['under_review', 'resolved', 'rejected'] as const),
  resolution: vine.string().trim().minLength(10).maxLength(4_000).optional(),
})

export const adminDisputeQueryValidator = vine.create({
  status: vine.enum(['open', 'under_review', 'resolved', 'rejected'] as const).optional(),
  companyId: vine.number().positive().withoutDecimals().optional(),
  bookingId: vine.number().positive().withoutDecimals().optional(),
  ...pagination,
})
