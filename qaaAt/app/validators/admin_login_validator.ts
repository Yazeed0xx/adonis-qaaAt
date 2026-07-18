import vine from '@vinejs/vine'

/**
 * Validator for admin login
 */
export const adminLoginValidator = vine.create({
  email: vine.string().email(),
  password: vine.string(),
})
