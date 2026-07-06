import vine from '@vinejs/vine'

/**
 * Validator for verifying a user's email with a one-time code
 */
export const verifyEmailValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
    code: vine.string().regex(/^\d{6}$/),
  })
)
