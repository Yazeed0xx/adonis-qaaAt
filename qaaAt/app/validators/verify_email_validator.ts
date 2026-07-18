import vine from '@vinejs/vine'

/**
 * Validator for verifying a user's email with a one-time code
 */
export const verifyEmailValidator = vine.create({
  email: vine.string().email(),
  code: vine.string().regex(/^\d{6}$/),
})
