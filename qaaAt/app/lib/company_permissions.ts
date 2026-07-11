export const companyPermissions = [
  'spaces.view',
  'spaces.manage',
  'calendar.view',
  'calendar.manage',
  'booking_requests.view',
  'booking_requests.manage',
  'inquiries.view',
  'inquiries.manage',
  'bookings.view',
  'bookings.manage',
  'quotes.view',
  'quotes.manage',
  'pricing.view',
  'pricing.manage',
  'visits.view',
  'visits.manage',
  'finance.view',
  'refunds.request',
  'refunds.approve',
  'members.view',
  'members.manage',
  'company.view',
  'company.manage',
  'payout_settings.manage',
] as const

export type CompanyPermission = (typeof companyPermissions)[number]
export type CompanyRole =
  | 'owner'
  | 'manager'
  | 'booking_staff'
  | 'calendar_staff'
  | 'accountant'
  | 'viewer'

export const rolePermissions: Record<CompanyRole, readonly CompanyPermission[]> = {
  owner: companyPermissions,
  manager: companyPermissions.filter((permission) => permission !== 'payout_settings.manage'),
  booking_staff: [
    'spaces.view',
    'calendar.view',
    'booking_requests.view',
    'booking_requests.manage',
    'inquiries.view',
    'inquiries.manage',
    'bookings.view',
    'bookings.manage',
    'quotes.view',
    'quotes.manage',
    'pricing.view',
    'pricing.manage',
    'visits.view',
    'visits.manage',
  ],
  calendar_staff: [
    'spaces.view',
    'calendar.view',
    'calendar.manage',
    'booking_requests.view',
    'inquiries.view',
    'bookings.view',
    'visits.view',
    'visits.manage',
  ],
  accountant: [
    'spaces.view',
    'bookings.view',
    'quotes.view',
    'pricing.view',
    'finance.view',
    'refunds.request',
  ],
  viewer: [
    'spaces.view',
    'calendar.view',
    'booking_requests.view',
    'inquiries.view',
    'bookings.view',
    'quotes.view',
    'pricing.view',
    'visits.view',
    'company.view',
  ],
}

export function resolvePermissions(
  role: CompanyRole,
  overrides: Array<{ permission: CompanyPermission; effect: 'allow' | 'deny' }> = []
) {
  const permissions = new Set<CompanyPermission>(rolePermissions[role])
  for (const override of overrides.filter((item) => item.effect === 'allow'))
    permissions.add(override.permission)
  for (const override of overrides.filter((item) => item.effect === 'deny'))
    permissions.delete(override.permission)
  return [...permissions]
}
