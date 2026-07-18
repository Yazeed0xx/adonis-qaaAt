import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import {
  resolvePermissions,
  type CompanyPermission,
  type CompanyRole,
} from '#lib/company_permissions'

interface MembershipRow {
  id: number
  user_id: number
  role: CompanyRole
}

interface PermissionOverrideRow {
  company_membership_id: number
  permission: CompanyPermission
  effect: 'allow' | 'deny'
}

export async function companyNotificationRecipients(
  client: QueryClientContract,
  companyId: number,
  permission: CompanyPermission
) {
  const members = (await client
    .from('company_memberships')
    .where({ company_id: companyId, status: 'active' })
    .select('id', 'user_id', 'role')) as MembershipRow[]

  if (members.length === 0) return []

  const overrides = (await client
    .from('company_membership_permissions')
    .whereIn(
      'company_membership_id',
      members.map((member) => member.id)
    )
    .select('company_membership_id', 'permission', 'effect')) as PermissionOverrideRow[]

  return members
    .filter((member) =>
      resolvePermissions(
        member.role,
        overrides
          .filter((override) => override.company_membership_id === member.id)
          .map(({ permission: overriddenPermission, effect }) => ({
            permission: overriddenPermission,
            effect,
          }))
      ).includes(permission)
    )
    .map((member) => member.user_id)
}
