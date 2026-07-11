import vine from '@vinejs/vine'
import { companyPermissions } from '#lib/company_permissions'

const roles = [
  'owner',
  'manager',
  'booking_staff',
  'calendar_staff',
  'accountant',
  'viewer',
] as const
const effects = ['allow', 'deny'] as const

const permissionOverride = vine.object({
  permission: vine.enum(companyPermissions),
  effect: vine.enum(effects),
})

export const createCompanyInvitationValidator = vine.create({
  name: vine.string().trim().minLength(2).maxLength(120),
  email: vine.string().trim().email().normalizeEmail(),
  role: vine.enum(roles),
  permissionOverrides: vine
    .array(permissionOverride)
    .maxLength(companyPermissions.length)
    .optional(),
})

export const invitationTokenValidator = vine.create({
  token: vine.string().trim().minLength(32).maxLength(200),
})

export const acceptCompanyInvitationValidator = vine.create({
  token: vine.string().trim().minLength(32).maxLength(200),
  name: vine.string().trim().minLength(2).maxLength(120).optional(),
  password: vine.string().minLength(8).maxLength(128).optional(),
})

export const updateCompanyMemberValidator = vine.create({
  role: vine.enum(roles).optional(),
  status: vine.enum(['active', 'suspended', 'revoked'] as const).optional(),
  permissionOverrides: vine
    .array(permissionOverride)
    .maxLength(companyPermissions.length)
    .optional(),
})
