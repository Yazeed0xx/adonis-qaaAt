import vine from '@vinejs/vine'

/**
 * Validator for company login
 */
export const companyLoginValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
    password: vine.string(),
  })
)
