import { freezeTime } from '@japa/runner'

export const TEST_NOW = new Date('2026-06-15T09:00:00.000Z')

export function freezeTestTime(now: Date = TEST_NOW) {
  freezeTime(now)
  return now
}
