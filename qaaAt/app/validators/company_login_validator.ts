import vine from '@vinejs/vine'

/**
 * Validator for company login
 */
export const companyLoginValidator = vine.create({
  email: vine.string().email(),
  password: vine.string(),
  companyId: vine.number().positive().optional(),
})
