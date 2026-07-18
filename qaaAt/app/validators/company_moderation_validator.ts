import vine from '@vinejs/vine'

export const companyModerationReasonValidator = vine.create({
  reason: vine.string().trim().minLength(10).maxLength(1_000),
})

export const companyModerationParamsValidator = vine.create({
  id: vine.number().positive().withoutDecimals(),
})
