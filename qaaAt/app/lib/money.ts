export function fromDatabaseAmount(value: string): number {
  return Number(value)
}

export function toDatabaseAmount(value: number): string {
  return String(value)
}

export function sumDatabaseAmounts(values: string[]): number {
  return values.reduce((sum, value) => sum + fromDatabaseAmount(value), 0)
}

const MAX_SAFE_MINOR = BigInt(Number.MAX_SAFE_INTEGER)

export function canonicalMajorAmount(value: string): string {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) throw new Error('Invalid database monetary amount')
  const whole = BigInt(match[1]).toString()
  const fraction = (match[2] ?? '').padEnd(2, '0')
  return `${whole}.${fraction}`
}

export function legacyCompatibleAmount(value: string): number | null {
  const canonical = canonicalMajorAmount(value)
  const [whole, fraction] = canonical.split('.')
  const minor = BigInt(whole) * 100n + BigInt(fraction)
  if (minor > MAX_SAFE_MINOR) return null
  return Number(canonical)
}
