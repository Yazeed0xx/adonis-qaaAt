import { DateTime } from 'luxon'
import InventoryException from '#exceptions/inventory_exception'

export function assertWallTime(value: string, field = 'time') {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new InventoryException(
      `${field} must be a valid HH:mm wall time`,
      'WALL_TIME_INVALID',
      422
    )
  return value
}

export function wallMinutes(value: string) {
  assertWallTime(value)
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function windowBounds(start: string, end: string, endsNextDay = false) {
  const from = wallMinutes(start)
  let until = wallMinutes(end)
  if (endsNextDay || until <= from) until += 1440
  return { from, until }
}

export function assertNonOverlappingWindows(
  rows: Array<{ weekday: number; start: string; end: string; endsNextDay?: boolean }>,
  label: string
) {
  for (const row of rows) {
    assertWallTime(row.start, `${label}.start`)
    assertWallTime(row.end, `${label}.end`)
  }
  for (let weekday = 0; weekday < 7; weekday++) {
    const windows = rows
      .filter((row) => row.weekday === weekday)
      .map((row) => windowBounds(row.start, row.end, row.endsNextDay))
      .sort((a, b) => a.from - b.from)
    for (let index = 1; index < windows.length; index++)
      if (windows[index].from < windows[index - 1].until)
        throw new InventoryException(`${label} windows overlap`, 'CALENDAR_WINDOWS_OVERLAP', 422)
  }
}

export function localDateValue(value: unknown) {
  if (value instanceof Date) return DateTime.fromJSDate(value).toISODate()
  return String(value).slice(0, 10)
}
