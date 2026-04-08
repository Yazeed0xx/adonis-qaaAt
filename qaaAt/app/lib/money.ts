export function fromDatabaseAmount(value: string): number {
  return Number(value)
}

export function toDatabaseAmount(value: number): string {
  return String(value)
}

export function sumDatabaseAmounts(values: string[]): number {
  return values.reduce((sum, value) => sum + fromDatabaseAmount(value), 0)
}
