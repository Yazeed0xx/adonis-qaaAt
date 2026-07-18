import vine from '@vinejs/vine'

/**
 * Validator for user registration
 */
export const userRegisterValidator = vine.create({
  userName: vine.string().trim().minLength(2),
  email: vine
    .string()
    .email()
    .unique(async (db, value) => {
      const user = await db.from('users').where('email', value).first()
      return !user
    }),
  password: vine.string().minLength(8),
  firstName: vine.string().optional(),
  lastName: vine.string().optional(),
  phone: vine.string().optional(),
  address: vine.string().optional(),
})
