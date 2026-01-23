import vine from '@vinejs/vine'

/**
 * Validator for admin login
 */
export const adminLoginValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
    password: vine.string(),
  })
)
