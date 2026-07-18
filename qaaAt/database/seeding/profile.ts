export type SeedProfile = 'mobile'

export function resolveSeedProfile(value = process.env.SEED_PROFILE): SeedProfile {
  if (!value || value === 'mobile') return 'mobile'
  throw new Error(`Unsupported SEED_PROFILE "${value}". Use "mobile".`)
}
