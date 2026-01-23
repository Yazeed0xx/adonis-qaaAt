import vine from '@vinejs/vine'

/**
 * Validator for user login
 */
export const userLoginValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
    password: vine.string(),
  })
)
