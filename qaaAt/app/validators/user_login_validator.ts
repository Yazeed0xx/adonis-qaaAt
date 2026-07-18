import vine from '@vinejs/vine'

/**
 * Validator for user login
 */
export const userLoginValidator = vine.create({
  email: vine.string().email(),
  password: vine.string(),
})
