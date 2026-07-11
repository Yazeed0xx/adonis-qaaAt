import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import InventoryException from '#exceptions/inventory_exception'

export class AvailabilityPolicyService {
  async assertRequestFitsAvailabilityPolicy(
    trx: TransactionClientContract,
    input: { spaceId: number; startsAt: DateTime; endsAt: DateTime; sessionCode?: string }
  ) {
    const space = await trx
      .from('spaces')
      .join('venues', 'venues.id', 'spaces.venue_id')
      .where('spaces.id', input.spaceId)
      .select('spaces.*', 'venues.timezone')
      .firstOrFail()
    const policy = await trx
      .from('space_availability_policies')
      .where('space_id', input.spaceId)
      .where('is_active', true)
      .first()
    if (!policy)
      throw new InventoryException(
        'Space has no active availability policy',
        'AVAILABILITY_POLICY_REQUIRED',
        409
      )
    if (input.endsAt <= input.startsAt)
      throw new InventoryException(
        'Requested end must follow start',
        'AVAILABILITY_RANGE_INVALID',
        422
      )
    const duration = input.endsAt.diff(input.startsAt, 'minutes').minutes
    if (duration < policy.minimum_duration_minutes || duration > policy.maximum_duration_minutes)
      throw new InventoryException(
        'Requested duration violates Space policy',
        'AVAILABILITY_DURATION_INVALID',
        409
      )
    const now = DateTime.now().toUTC()
    if (input.startsAt.toUTC() < now.plus({ minutes: policy.minimum_notice_minutes }))
      throw new InventoryException(
        'Requested start violates minimum notice',
        'AVAILABILITY_NOTICE_INVALID',
        409
      )
    if (input.startsAt.toUTC() > now.plus({ days: policy.maximum_advance_days }))
      throw new InventoryException(
        'Requested start exceeds advance horizon',
        'AVAILABILITY_ADVANCE_INVALID',
        409
      )

    const start = input.startsAt.setZone(space.timezone)
    const end = input.endsAt.setZone(space.timezone)
    if (policy.mode === 'session')
      await this.assertSession(trx, input.spaceId, start, end, input.sessionCode)
    else if (policy.mode === 'full_day') await this.assertFullDay(trx, input.spaceId, start, end)
    else if (policy.mode === 'multi_day') await this.assertMultiDay(trx, input.spaceId, start, end)
    else await this.assertHourly(trx, input.spaceId, start, end)
    return { space, policy, start, end }
  }

  private async effectiveWindows(trx: TransactionClientContract, spaceId: number, day: DateTime) {
    const date = day.toISODate()!
    const exceptions = await trx
      .from('availability_exceptions')
      .where('space_id', spaceId)
      .where('local_date', date)
    if (exceptions.some((row) => row.kind === 'closed')) return []
    const overrides = exceptions.filter((row) => row.kind !== 'closed')
    if (overrides.length)
      return overrides.map((row) => ({
        start: row.starts_at_local,
        end: row.ends_at_local,
        endsNextDay: row.ends_next_day,
      }))
    const weekday = day.weekday % 7
    const hours = await trx
      .from('space_operating_hours')
      .where('space_id', spaceId)
      .where('weekday', weekday)
    return hours.map((row) => ({
      start: row.opens_at_local,
      end: row.closes_at_local,
      endsNextDay: row.ends_next_day,
    }))
  }

  private concrete(day: DateTime, window: { start: string; end: string; endsNextDay?: boolean }) {
    const date = day.toISODate()!
    const start = DateTime.fromISO(`${date}T${window.start}`, { zone: day.zoneName! })
    let end = DateTime.fromISO(`${date}T${window.end}`, { zone: day.zoneName! })
    if (window.endsNextDay || end <= start) end = end.plus({ days: 1 })
    return { start, end }
  }

  private async assertHourly(
    trx: TransactionClientContract,
    spaceId: number,
    start: DateTime,
    end: DateTime
  ) {
    const windows = await this.effectiveWindows(trx, spaceId, start.startOf('day'))
    if (
      !windows.some((window) => {
        const concrete = this.concrete(start, window)
        return start >= concrete.start && end <= concrete.end
      })
    )
      throw new InventoryException(
        'Request is outside operating hours or on a closed date',
        'AVAILABILITY_SCHEDULE_CONFLICT',
        409
      )
  }

  private async assertSession(
    trx: TransactionClientContract,
    spaceId: number,
    start: DateTime,
    end: DateTime,
    sessionCode?: string
  ) {
    const closed = await trx
      .from('availability_exceptions')
      .where('space_id', spaceId)
      .where('local_date', start.toISODate()!)
      .where('kind', 'closed')
      .first()
    if (closed)
      throw new InventoryException(
        'Requested session is closed',
        'AVAILABILITY_SCHEDULE_CONFLICT',
        409
      )
    const sessions = await trx
      .from('space_availability_sessions')
      .where('space_id', spaceId)
      .where('weekday', start.weekday % 7)
      .where('is_active', true)
    const matches = sessions.some((row) => {
      if (sessionCode && row.code !== sessionCode) return false
      const concrete = this.concrete(start, {
        start: row.starts_at_local,
        end: row.ends_at_local,
        endsNextDay: row.ends_next_day,
      })
      return start.equals(concrete.start) && end.equals(concrete.end)
    })
    if (!matches)
      throw new InventoryException(
        'Request does not match a configured session',
        'AVAILABILITY_SESSION_INVALID',
        409
      )
  }

  private async assertFullDay(
    trx: TransactionClientContract,
    spaceId: number,
    start: DateTime,
    end: DateTime
  ) {
    const windows = await this.effectiveWindows(trx, spaceId, start.startOf('day'))
    if (windows.length !== 1)
      throw new InventoryException(
        'Full-day mode requires exactly one effective daily window',
        'AVAILABILITY_FULL_DAY_INVALID',
        409
      )
    const concrete = this.concrete(start, windows[0])
    if (!start.equals(concrete.start) || !end.equals(concrete.end))
      throw new InventoryException(
        'Request must cover the full configured day',
        'AVAILABILITY_FULL_DAY_INVALID',
        409
      )
  }

  private async assertMultiDay(
    trx: TransactionClientContract,
    spaceId: number,
    start: DateTime,
    end: DateTime
  ) {
    let day = start.startOf('day')
    let first: DateTime | null = null
    for (let configuredDay = 0; configuredDay < 31; configuredDay++) {
      const windows = await this.effectiveWindows(trx, spaceId, day)
      if (windows.length !== 1)
        throw new InventoryException(
          'Every multi-day date requires exactly one effective window',
          'AVAILABILITY_MULTI_DAY_GAP',
          409
        )
      const concrete = this.concrete(day, windows[0])
      first ??= concrete.start
      if (!start.equals(first)) break
      if (concrete.end.equals(end)) return
      if (concrete.end > end) break
      day = day.plus({ days: 1 })
    }
    throw new InventoryException(
      'Request is not one contiguous configured multi-day range',
      'AVAILABILITY_MULTI_DAY_INVALID',
      409
    )
  }
}

export default new AvailabilityPolicyService()
