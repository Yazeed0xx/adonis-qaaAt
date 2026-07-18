import vine from '@vinejs/vine'

const alt = vine.string().trim().maxLength(240).nullable().optional()
export const spaceMediaAltValidator = vine.create({ altTextAr: alt, altTextEn: alt })
export const spaceMediaOrderValidator = vine.create({
  mediaIds: vine.array(vine.number().positive().withoutDecimals()).minLength(1).maxLength(20),
})
export const spaceMediaRejectValidator = vine.create({
  reason: vine.string().trim().minLength(1).maxLength(500),
})
