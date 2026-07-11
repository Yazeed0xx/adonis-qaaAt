import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import InventoryException from '#exceptions/inventory_exception'
import { localDateValue } from '#lib/calendar_time'

type Range = { start: DateTime; end: DateTime }

export class AvailabilityService {
  parseRange(from: string, to: string, maxDays: number) {
    const start = DateTime.fromISO(from, { setZone: true })
    const end = DateTime.fromISO(to, { setZone: true })
    if (!start.isValid || !end.isValid || !start.isOffsetFixed || !end.isOffsetFixed)
      throw new InventoryException(
        'from and to must be unambiguous ISO instants with an explicit offset',
        'AVAILABILITY_RANGE_INVALID',
        422
      )
    if (end <= start || end.diff(start, 'days').days > maxDays)
      throw new InventoryException(
        `Availability range must satisfy from < to and be at most ${maxDays} days`,
        'AVAILABILITY_RANGE_LIMIT',
        422
      )
    return { start: start.toUTC(), end: end.toUTC() }
  }

  async publicAvailability(
    spaceId: number,
    from: string,
    to: string,
    options: { durationMinutes?: number; durationDays?: number } = {}
  ) {
    const range = this.parseRange(from, to, 31)
    const space = await db
      .from('spaces')
      .join('venues', 'venues.id', 'spaces.venue_id')
      .join('companies', 'companies.id', 'spaces.company_id')
      .where('spaces.id', spaceId)
      .where('spaces.publication_status', 'published')
      .whereNull('spaces.deleted_at')
      .where('companies.status', 'approved')
      .whereNull('companies.deleted_at')
      .where((query) =>
        query.whereNull('spaces.legacy_hall_id').orWhere('spaces.legacy_is_available', true)
      )
      .select('spaces.*', 'venues.timezone')
      .first()
    if (!space) throw new InventoryException('Published Space not found', 'SPACE_NOT_FOUND', 404)
    return this.calculate(space, range, options)
  }

  async calculate(
    space: any,
    range: Range,
    options: { durationMinutes?: number; durationDays?: number } = {}
  ) {
    const policy = await db
      .from('space_availability_policies')
      .where('space_id', space.id)
      .where('is_active', true)
      .first()
    if (!policy) return { spaceId: space.id, timezone: space.timezone, mode: null, slots: [] }
    const localStart = range.start.setZone(space.timezone).startOf('day')
    const localEnd = range.end.setZone(space.timezone).endOf('day')
    const [hours, exceptions, blocks, sessions] = await Promise.all([
      db
        .from('space_operating_hours')
        .where('space_id', space.id)
        .orderBy(['weekday', 'sort_order']),
      db
        .from('availability_exceptions')
        .where('space_id', space.id)
        .whereBetween('local_date', [localStart.toISODate()!, localEnd.toISODate()!]),
      db
        .from('space_inventory_blocks')
        .where('space_id', space.id)
        .where('status', 'active')
        .where('blocked_from_at', '<', range.end.toSQL()!)
        .where('blocked_until_at', '>', range.start.toSQL()!)
        .orderBy('blocked_from_at'),
      db.from('space_availability_sessions').where('space_id', space.id).where('is_active', true),
    ])
    const durationMinutes = options.durationMinutes ?? policy.minimum_duration_minutes
    if (
      durationMinutes < policy.minimum_duration_minutes ||
      durationMinutes > policy.maximum_duration_minutes
    )
      throw new InventoryException(
        'Requested duration violates Space policy',
        'AVAILABILITY_DURATION_INVALID',
        422
      )
    const durationDays = options.durationDays ?? Math.max(1, Math.ceil(durationMinutes / 1440))
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 31)
      throw new InventoryException(
        'Multi-day duration must be between 1 and 31 days',
        'AVAILABILITY_MULTI_DAY_LIMIT',
        422
      )
    const candidates: Array<{
      start: DateTime
      end: DateTime
      code?: string
      nameAr?: string
      nameEn?: string
    }> = []
    const exceptionsFor = (date: string) =>
      exceptions.filter((item) => localDateValue(item.local_date) === date)
    const effectiveHours = (day: DateTime) => {
      const date = day.toISODate()!
      const exceptionRows = exceptionsFor(date)
      if (exceptionRows.some((item) => item.kind === 'closed')) return []
      const overrides = exceptionRows.filter((item) => item.kind !== 'closed')
      return overrides.length
        ? overrides.filter((item) => item.starts_at_local)
        : hours.filter((item) => item.weekday === day.weekday % 7)
    }
    const concrete = (day: DateTime, window: any) => {
      const date = day.toISODate()!
      const startText = window.starts_at_local ?? window.opens_at_local
      const endText = window.ends_at_local ?? window.closes_at_local
      const start = DateTime.fromISO(`${date}T${startText}`, { zone: space.timezone })
      let end = DateTime.fromISO(`${date}T${endText}`, { zone: space.timezone })
      if (window.ends_next_day || end <= start) end = end.plus({ days: 1 })
      return { start, end }
    }
    for (
      let day = localStart;
      day < localEnd && candidates.length <= 5000;
      day = day.plus({ days: 1 })
    ) {
      const date = day.toISODate()!
      const exceptionRows = exceptionsFor(date)
      if (exceptionRows.some((item) => item.kind === 'closed')) continue
      const weekday = day.weekday % 7
      if (policy.mode === 'multi_day') {
        const days: Array<{ start: DateTime; end: DateTime }> = []
        for (let offset = 0; offset < durationDays; offset++) {
          const target = day.plus({ days: offset })
          const windows = effectiveHours(target).map((window) => concrete(target, window))
          if (windows.length !== 1) {
            days.length = 0
            break
          }
          days.push(windows[0])
        }
        if (days.length === durationDays)
          candidates.push({ start: days[0].start, end: days.at(-1)!.end })
        continue
      }
      const source =
        policy.mode === 'session'
          ? sessions.filter((item) => item.weekday === weekday)
          : effectiveHours(day)
      if (policy.mode === 'full_day') {
        const windows = source
          .map((window) => concrete(day, window))
          .sort((a, b) => a.start.toMillis() - b.start.toMillis())
        if (windows.length === 1) candidates.push(windows[0])
        continue
      }
      for (const window of source) {
        const { start, end } = concrete(day, window)
        if (policy.mode === 'hourly') {
          for (
            let cursor = start;
            cursor.plus({ minutes: durationMinutes }) <= end;
            cursor = cursor.plus({ minutes: policy.slot_increment_minutes })
          )
            candidates.push({
              start: cursor,
              end: cursor.plus({ minutes: durationMinutes }),
            })
        } else
          candidates.push({
            start,
            end,
            code: window.code,
            nameAr: window.name_ar,
            nameEn: window.name_en,
          })
      }
    }
    if (candidates.length > 5000)
      throw new InventoryException('Generated slot limit exceeded', 'AVAILABILITY_SLOT_LIMIT', 422)
    const now = DateTime.now()
    const slots = candidates
      .filter((candidate) => {
        const minutes = candidate.end.diff(candidate.start, 'minutes').minutes
        return (
          minutes >= policy.minimum_duration_minutes && minutes <= policy.maximum_duration_minutes
        )
      })
      .filter((candidate) => candidate.start >= range.start && candidate.end <= range.end)
      .filter(
        (candidate) => candidate.start >= now.plus({ minutes: policy.minimum_notice_minutes })
      )
      .filter((candidate) => candidate.start <= now.plus({ days: policy.maximum_advance_days }))
      .map((candidate) => ({
        startAt: candidate.start.toUTC().toISO(),
        endAt: candidate.end.toUTC().toISO(),
        localStart: candidate.start.toISO(),
        localEnd: candidate.end.toISO(),
        code: candidate.code ?? null,
        nameAr: candidate.nameAr ?? null,
        nameEn: candidate.nameEn ?? null,
        isAvailable: !blocks.some(
          (block) =>
            DateTime.fromJSDate(block.blocked_from_at) < candidate.end &&
            DateTime.fromJSDate(block.blocked_until_at) > candidate.start
        ),
      }))
    return { spaceId: space.id, timezone: space.timezone, mode: policy.mode, slots }
  }

  async legacyHallAvailability(hallId: number, date: DateTime) {
    const mapped = await db
      .from('spaces')
      .join('venues', 'venues.id', 'spaces.venue_id')
      .where('spaces.legacy_hall_id', hallId)
      .select('spaces.*', 'venues.timezone')
      .firstOrFail()
    const start = DateTime.fromISO(date.toISODate()!, { zone: mapped.timezone }).startOf('day')
    const result = await this.calculate(mapped, {
      start: start.toUTC(),
      end: start.plus({ days: 1 }).toUTC(),
    })
    return result.slots.map((slot: any) => ({
      startTime: DateTime.fromISO(slot.localStart).toFormat('HH:mm'),
      endTime: DateTime.fromISO(slot.localEnd).toFormat('HH:mm'),
      isAvailable: slot.isAvailable,
    }))
  }
}

export default new AvailabilityService()
