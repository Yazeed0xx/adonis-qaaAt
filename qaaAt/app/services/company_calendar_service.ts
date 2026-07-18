import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import InventoryException from '#exceptions/inventory_exception'
import inventoryService from '#services/inventory_service'
import { assertNonOverlappingWindows, assertWallTime } from '#lib/calendar_time'

function isOverlap(error: unknown) {
  const value = error as { code?: string; cause?: { code?: string } }
  return value.code === '23P01' || value.cause?.code === '23P01'
}

export class CompanyCalendarService {
  async setPolicy(companyId: number, spaceId: number, input: any) {
    if (input.minimumDurationMinutes > input.maximumDurationMinutes)
      throw new InventoryException(
        'Minimum duration exceeds maximum duration',
        'DURATION_RANGE_INVALID',
        422
      )
    assertNonOverlappingWindows(
      input.operatingHours.map((item: any) => ({
        weekday: item.weekday,
        start: item.opensAtLocal,
        end: item.closesAtLocal,
        endsNextDay: item.endsNextDay,
      })),
      'Operating hour'
    )
    return db.transaction(async (trx) => {
      await trx.from('spaces').where('id', spaceId).where('company_id', companyId).firstOrFail()
      await trx.from('space_availability_policies').where('space_id', spaceId).delete()
      const [policy] = await trx
        .table('space_availability_policies')
        .insert({
          company_id: companyId,
          space_id: spaceId,
          mode: input.mode,
          slot_increment_minutes: input.slotIncrementMinutes,
          minimum_duration_minutes: input.minimumDurationMinutes,
          maximum_duration_minutes: input.maximumDurationMinutes,
          minimum_notice_minutes: input.minimumNoticeMinutes,
          maximum_advance_days: input.maximumAdvanceDays,
          preparation_buffer_minutes: input.preparationBufferMinutes,
          cleanup_buffer_minutes: input.cleanupBufferMinutes,
          created_at: DateTime.now().toSQL(),
        })
        .returning('*')
      await trx.from('space_operating_hours').where('space_id', spaceId).delete()
      if (input.operatingHours.length)
        await trx.table('space_operating_hours').insert(
          input.operatingHours.map((item: any, index: number) => ({
            company_id: companyId,
            space_id: spaceId,
            weekday: item.weekday,
            opens_at_local: item.opensAtLocal,
            closes_at_local: item.closesAtLocal,
            ends_next_day: item.endsNextDay ?? false,
            sort_order: index,
            created_at: DateTime.now().toSQL(),
          }))
        )
      return policy
    })
  }

  async getPolicy(companyId: number, spaceId: number) {
    await db.from('spaces').where('id', spaceId).where('company_id', companyId).firstOrFail()
    const policy = await db.from('space_availability_policies').where('space_id', spaceId).first()
    const operatingHours = await db
      .from('space_operating_hours')
      .where('space_id', spaceId)
      .orderBy(['weekday', 'sort_order'])
    return { policy, operatingHours }
  }

  async listSessions(companyId: number, spaceId: number) {
    await db.from('spaces').where('id', spaceId).where('company_id', companyId).firstOrFail()
    return db
      .from('space_availability_sessions')
      .where('space_id', spaceId)
      .orderBy(['weekday', 'starts_at_local'])
  }

  async saveSession(companyId: number, spaceId: number, input: any, sessionId?: number) {
    if (!input.name.ar && !input.name.en)
      throw new InventoryException(
        'Session requires Arabic or English name',
        'LOCALIZED_VALUE_REQUIRED',
        422
      )
    assertWallTime(input.startsAtLocal, 'startsAtLocal')
    assertWallTime(input.endsAtLocal, 'endsAtLocal')
    return db.transaction(async (trx) => {
      await trx.from('spaces').where('id', spaceId).where('company_id', companyId).firstOrFail()
      const existingQuery = trx.from('space_availability_sessions').where('space_id', spaceId)
      if (sessionId) existingQuery.whereNot('id', sessionId)
      const existing = await existingQuery
      assertNonOverlappingWindows(
        [
          ...existing.map((row: any) => ({
            weekday: row.weekday,
            start: String(row.starts_at_local).slice(0, 5),
            end: String(row.ends_at_local).slice(0, 5),
            endsNextDay: row.ends_next_day,
          })),
          {
            weekday: input.weekday,
            start: input.startsAtLocal,
            end: input.endsAtLocal,
            endsNextDay: input.endsNextDay,
          },
        ],
        'Session'
      )
      const values = {
        company_id: companyId,
        space_id: spaceId,
        code: input.code,
        name_ar: input.name.ar ?? null,
        name_en: input.name.en ?? null,
        weekday: input.weekday,
        starts_at_local: input.startsAtLocal,
        ends_at_local: input.endsAtLocal,
        ends_next_day: input.endsNextDay ?? false,
        is_active: input.isActive ?? true,
        updated_at: DateTime.now().toSQL(),
      }
      if (sessionId) {
        const [updated] = await trx
          .from('space_availability_sessions')
          .where('id', sessionId)
          .where('space_id', spaceId)
          .update(values)
          .returning('*')
        if (!updated) throw new InventoryException('Session not found', 'SESSION_NOT_FOUND', 404)
        return updated
      }
      const [created] = await trx
        .table('space_availability_sessions')
        .insert({ ...values, created_at: DateTime.now().toSQL() })
        .returning('*')
      return created
    })
  }

  async deleteSession(companyId: number, spaceId: number, sessionId: number) {
    const deleted = await db
      .from('space_availability_sessions')
      .where('id', sessionId)
      .where('space_id', spaceId)
      .where('company_id', companyId)
      .delete()
    if (!deleted) throw new InventoryException('Session not found', 'SESSION_NOT_FOUND', 404)
  }

  private validateException(input: any) {
    const hasStart = input.startsAtLocal !== undefined
    const hasEnd = input.endsAtLocal !== undefined
    if (input.kind === 'closed' && (hasStart || hasEnd))
      throw new InventoryException(
        'closed exception must not include times',
        'EXCEPTION_FIELDS_INVALID',
        422
      )
    if (input.kind !== 'closed' && (!hasStart || !hasEnd))
      throw new InventoryException(
        `${input.kind} requires startsAtLocal and endsAtLocal`,
        'EXCEPTION_FIELDS_REQUIRED',
        422
      )
    if (hasStart) assertWallTime(input.startsAtLocal, 'startsAtLocal')
    if (hasEnd) assertWallTime(input.endsAtLocal, 'endsAtLocal')
  }

  private async assertExceptionWindows(
    client: any,
    spaceId: number,
    input: any,
    excludeId?: number
  ) {
    const rowsQuery = client
      .from('availability_exceptions')
      .where('space_id', spaceId)
      .where('local_date', input.localDate)
    if (excludeId) rowsQuery.whereNot('id', excludeId)
    const rows = await rowsQuery
    if (
      rows.some((row: any) => row.kind === 'closed') ||
      (input.kind === 'closed' && rows.length > 0)
    )
      throw new InventoryException(
        'A closed exception cannot coexist with other windows',
        'EXCEPTION_CONFLICT',
        422
      )
    if (input.kind !== 'closed')
      assertNonOverlappingWindows(
        [
          ...rows.map((row: any) => ({
            weekday: 0,
            start: String(row.starts_at_local).slice(0, 5),
            end: String(row.ends_at_local).slice(0, 5),
            endsNextDay: row.ends_next_day,
          })),
          {
            weekday: 0,
            start: input.startsAtLocal,
            end: input.endsAtLocal,
            endsNextDay: input.endsNextDay,
          },
        ],
        'Exception'
      )
  }

  async addException(companyId: number, spaceId: number, actorUserId: number, input: any) {
    this.validateException(input)
    return db.transaction(async (trx) => {
      await trx.from('spaces').where('id', spaceId).where('company_id', companyId).firstOrFail()
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
        `space-exception:${spaceId}:${input.localDate}`,
      ])
      await this.assertExceptionWindows(trx, spaceId, input)
      const [row] = await trx
        .table('availability_exceptions')
        .insert({
          company_id: companyId,
          space_id: spaceId,
          local_date: input.localDate,
          kind: input.kind,
          starts_at_local: input.startsAtLocal ?? null,
          ends_at_local: input.endsAtLocal ?? null,
          ends_next_day: input.endsNextDay ?? false,
          reason: input.reason ?? null,
          created_by_user_id: actorUserId,
          created_at: DateTime.now().toSQL(),
        })
        .returning('*')
      return row
    })
  }

  async listExceptions(companyId: number, spaceId: number) {
    await db.from('spaces').where('id', spaceId).where('company_id', companyId).firstOrFail()
    return db.from('availability_exceptions').where('space_id', spaceId).orderBy('local_date')
  }

  async updateException(
    companyId: number,
    spaceId: number,
    exceptionId: number,
    actorUserId: number,
    input: any
  ) {
    this.validateException(input)
    return db.transaction(async (trx) => {
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
        `space-exception:${spaceId}:${input.localDate}`,
      ])
      await this.assertExceptionWindows(trx, spaceId, input, exceptionId)
      const [updated] = await trx
        .from('availability_exceptions')
        .where('id', exceptionId)
        .where('space_id', spaceId)
        .where('company_id', companyId)
        .update({
          local_date: input.localDate,
          kind: input.kind,
          starts_at_local: input.startsAtLocal ?? null,
          ends_at_local: input.endsAtLocal ?? null,
          ends_next_day: input.endsNextDay ?? false,
          reason: input.reason ?? null,
          created_by_user_id: actorUserId,
          updated_at: DateTime.now().toSQL(),
        })
        .returning('*')
      if (!updated) throw new InventoryException('Exception not found', 'EXCEPTION_NOT_FOUND', 404)
      return updated
    })
  }

  async deleteException(companyId: number, spaceId: number, exceptionId: number) {
    const deleted = await db
      .from('availability_exceptions')
      .where('id', exceptionId)
      .where('space_id', spaceId)
      .where('company_id', companyId)
      .delete()
    if (!deleted) throw new InventoryException('Exception not found', 'EXCEPTION_NOT_FOUND', 404)
  }

  private parseInstant(value: string, name: string) {
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(value))
      throw new InventoryException(
        `${name} must include an explicit UTC offset`,
        'CALENDAR_INSTANT_AMBIGUOUS',
        422
      )
    const parsed = DateTime.fromISO(value, { setZone: true })
    if (!parsed.isValid)
      throw new InventoryException(`${name} is invalid`, 'CALENDAR_INSTANT_INVALID', 422)
    return parsed
  }

  async createExternal(companyId: number, actorUserId: number, input: any) {
    return db.transaction(async (trx) => {
      const space = await trx
        .from('spaces')
        .where('id', input.spaceId)
        .where('company_id', companyId)
        .firstOrFail()
      const venue = await trx.from('venues').where('id', space.venue_id).firstOrFail()
      if (input.timezone !== venue.timezone)
        throw new InventoryException(
          'Timezone must match the Venue timezone',
          'CALENDAR_TIMEZONE_MISMATCH',
          422
        )
      const start = this.parseInstant(input.startsAt, 'startsAt')
      const end = this.parseInstant(input.endsAt, 'endsAt')
      if (end <= start)
        throw new InventoryException(
          'startsAt must be before endsAt',
          'CALENDAR_RANGE_INVALID',
          422
        )
      const expires = input.expiresAt ? this.parseInstant(input.expiresAt, 'expiresAt') : null
      if (input.type === 'external_hold' && !expires)
        throw new InventoryException(
          'external_hold requires expiresAt',
          'EXTERNAL_HOLD_EXPIRY_REQUIRED',
          422
        )
      if (input.type === 'external_hold' && expires! <= DateTime.now())
        throw new InventoryException(
          'external_hold expiresAt must be in the future',
          'EXTERNAL_HOLD_EXPIRY_INVALID',
          422
        )
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
        `space-inventory:${space.id}`,
      ])
      const [source] = await trx
        .table('external_reservations')
        .insert({
          company_id: companyId,
          space_id: space.id,
          type: input.type,
          starts_at: start.toUTC().toSQL(),
          ends_at: end.toUTC().toSQL(),
          original_start_local: input.startsAt,
          original_end_local: input.endsAt,
          original_timezone: input.timezone,
          preparation_buffer_minutes: input.preparationBufferMinutes ?? 0,
          cleanup_buffer_minutes: input.cleanupBufferMinutes ?? 0,
          expires_at: expires?.toUTC().toSQL() ?? null,
          internal_note: input.internalNote ?? null,
          created_by_user_id: actorUserId,
          created_at: DateTime.now().toSQL(),
        })
        .returning('*')
      try {
        const [block] = await trx
          .table('space_inventory_blocks')
          .insert({
            company_id: companyId,
            space_id: space.id,
            external_reservation_id: source.id,
            starts_at: start.toUTC().toSQL(),
            ends_at: end.toUTC().toSQL(),
            blocked_from_at: start
              .minus({ minutes: input.preparationBufferMinutes ?? 0 })
              .toUTC()
              .toSQL(),
            blocked_until_at: end
              .plus({ minutes: input.cleanupBufferMinutes ?? 0 })
              .toUTC()
              .toSQL(),
            created_at: DateTime.now().toSQL(),
          })
          .returning('id')
        await inventoryService.audit(
          trx,
          companyId,
          space.id,
          block.id,
          'external_reservation.created',
          { externalReservationId: source.id, type: source.type },
          actorUserId
        )
      } catch (error) {
        if (isOverlap(error))
          throw new InventoryException(
            'The external reservation overlaps active inventory',
            'INVENTORY_OVERLAP',
            409
          )
        throw error
      }
      return source
    })
  }

  async updateExternal(companyId: number, actorUserId: number, id: number, input: any) {
    return db.transaction(async (trx) => {
      const source = await trx
        .from('external_reservations')
        .where('id', id)
        .where('company_id', companyId)
        .where('status', 'active')
        .forUpdate()
        .firstOrFail()
      if (source.space_id !== input.spaceId)
        throw new InventoryException(
          'External reservation Space cannot change',
          'EXTERNAL_SPACE_IMMUTABLE',
          409
        )
      const space = await trx
        .from('spaces')
        .where('id', source.space_id)
        .where('company_id', companyId)
        .firstOrFail()
      const venue = await trx.from('venues').where('id', space.venue_id).firstOrFail()
      if (input.timezone !== venue.timezone)
        throw new InventoryException(
          'Timezone must match the Venue timezone',
          'CALENDAR_TIMEZONE_MISMATCH',
          422
        )
      const start = this.parseInstant(input.startsAt, 'startsAt')
      const end = this.parseInstant(input.endsAt, 'endsAt')
      const expires = input.expiresAt ? this.parseInstant(input.expiresAt, 'expiresAt') : null
      if (end <= start)
        throw new InventoryException(
          'startsAt must be before endsAt',
          'CALENDAR_RANGE_INVALID',
          422
        )
      if (input.type === 'external_hold' && !expires)
        throw new InventoryException(
          'external_hold requires expiresAt',
          'EXTERNAL_HOLD_EXPIRY_REQUIRED',
          422
        )
      if (input.type === 'external_hold' && expires! <= DateTime.now())
        throw new InventoryException(
          'external_hold expiresAt must be in the future',
          'EXTERNAL_HOLD_EXPIRY_INVALID',
          422
        )
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
        `space-inventory:${space.id}`,
      ])
      try {
        await trx
          .from('space_inventory_blocks')
          .where('external_reservation_id', id)
          .update({
            starts_at: start.toUTC().toSQL(),
            ends_at: end.toUTC().toSQL(),
            blocked_from_at: start
              .minus({ minutes: input.preparationBufferMinutes ?? 0 })
              .toUTC()
              .toSQL(),
            blocked_until_at: end
              .plus({ minutes: input.cleanupBufferMinutes ?? 0 })
              .toUTC()
              .toSQL(),
            updated_at: DateTime.now().toSQL(),
          })
      } catch (error) {
        if (isOverlap(error))
          throw new InventoryException(
            'The external reservation overlaps active inventory',
            'INVENTORY_OVERLAP',
            409
          )
        throw error
      }
      const [updated] = await trx
        .from('external_reservations')
        .where('id', id)
        .update({
          type: input.type,
          starts_at: start.toUTC().toSQL(),
          ends_at: end.toUTC().toSQL(),
          original_start_local: input.startsAt,
          original_end_local: input.endsAt,
          original_timezone: input.timezone,
          expires_at: expires?.toUTC().toSQL() ?? null,
          preparation_buffer_minutes: input.preparationBufferMinutes ?? 0,
          cleanup_buffer_minutes: input.cleanupBufferMinutes ?? 0,
          internal_note: input.internalNote ?? null,
          updated_at: DateTime.now().toSQL(),
        })
        .returning('*')
      await inventoryService.audit(
        trx,
        companyId,
        space.id,
        null,
        'external_reservation.updated',
        { externalReservationId: id },
        actorUserId
      )
      return updated
    })
  }

  async releaseExternal(companyId: number, actorUserId: number, id: number, reason = 'cancelled') {
    return db.transaction(async (trx) => {
      const source = await trx
        .from('external_reservations')
        .where('id', id)
        .where('company_id', companyId)
        .forUpdate()
        .firstOrFail()
      if (source.status !== 'active') return source
      const now = DateTime.now().toSQL()
      await trx
        .from('external_reservations')
        .where('id', id)
        .update({
          status: reason === 'expired' ? 'expired' : 'cancelled',
          cancelled_at: now,
          updated_at: now,
        })
      const block = await trx
        .from('space_inventory_blocks')
        .where('external_reservation_id', id)
        .where('status', 'active')
        .forUpdate()
        .first()
      if (block)
        await trx
          .from('space_inventory_blocks')
          .where('id', block.id)
          .update({ status: 'released', released_at: now, release_reason: reason, updated_at: now })
      await inventoryService.audit(
        trx,
        companyId,
        source.space_id,
        block?.id ?? null,
        `external_reservation.${reason}`,
        { externalReservationId: id },
        actorUserId
      )
      return { ...source, status: reason === 'expired' ? 'expired' : 'cancelled' }
    })
  }

  async expireExternalHolds() {
    return db.transaction(async (trx) => {
      const now = DateTime.now().toSQL()
      const claimed = await trx
        .from('external_reservations')
        .where('type', 'external_hold')
        .where('status', 'active')
        .where('expires_at', '<=', now)
        .orderBy('id')
        .forUpdate()
        .skipLocked()
        .limit(100)
      for (const item of claimed) {
        await trx
          .from('external_reservations')
          .where('id', item.id)
          .update({ status: 'expired', cancelled_at: now, updated_at: now })
        const block = await trx
          .from('space_inventory_blocks')
          .where('external_reservation_id', item.id)
          .where('status', 'active')
          .forUpdate()
          .first()
        if (block)
          await trx.from('space_inventory_blocks').where('id', block.id).update({
            status: 'released',
            released_at: now,
            release_reason: 'expired',
            updated_at: now,
          })
        await inventoryService.audit(
          trx,
          item.company_id,
          item.space_id,
          block?.id ?? null,
          'external_reservation.expired',
          { externalReservationId: item.id },
          item.created_by_user_id
        )
      }
      return claimed.length
    })
  }

  async feed(companyId: number, from: string, to: string, page: number, limit: number) {
    const start = this.parseInstant(from, 'from')
    const end = this.parseInstant(to, 'to')
    if (end <= start || end.diff(start, 'days').days > 93)
      throw new InventoryException(
        'Company calendar range is limited to 93 days',
        'CALENDAR_RANGE_LIMIT',
        422
      )
    return db
      .from('external_reservations')
      .where('company_id', companyId)
      .where('starts_at', '<', end.toUTC().toSQL())
      .where('ends_at', '>', start.toUTC().toSQL())
      .orderBy('starts_at')
      .paginate(page, Math.min(limit, 100))
  }
}

export default new CompanyCalendarService()
