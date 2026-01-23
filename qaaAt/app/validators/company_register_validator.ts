import vine from '@vinejs/vine'

/**
 * Validator for company registration
 */
export const companyRegisterValidator = vine.compile(
  vine.object({
    email: vine
      .string()
      .email()
      .unique(async (db, value) => {
        const user = await db.from('users').where('email', value).first()
        return !user
      }),
    password: vine.string().minLength(8),
    companyName: vine.string(),
    taxId: vine.string().optional(),
    registrationNumber: vine.string().optional(),
    registrationNumberPdf: vine.string().optional(),
    businessLicense: vine.string().optional(),
    contactPerson: vine.string().optional(),
    businessAddress: vine.string().optional(),
    city: vine.string(),
    description: vine.string().optional(),
    logo: vine.string().optional(),
    banner: vine.string().optional(),
    website: vine.string().optional(),
    socialLinks: vine.any().optional(),
  })
)
