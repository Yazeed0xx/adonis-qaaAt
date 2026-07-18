import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Booking from '#models/booking'
import InventoryException from '#exceptions/inventory_exception'
import availabilityPolicyService from '#services/availability_policy_service'

function isOverlap(error: unknown) {
  const value = error as { code?: string; cause?: { code?: string } }
  return value?.code === '23P01' || value?.cause?.code === '23P01'
}

export class InventoryService {
  async bookingRange(trx: TransactionClientContract, booking: Booking, space: any) {
    if (booking.startsAt && booking.endsAt) return { start: booking.startsAt, end: booking.endsAt }
    const venue = await trx.from('venues').where('id', space.venue_id).firstOrFail()
    const date = booking.bookingDate.toFormat('yyyy-MM-dd')
    const start = DateTime.fromISO(`${date}T${booking.startTime}`, { zone: venue.timezone })
    const end = DateTime.fromISO(`${date}T${booking.endTime}`, { zone: venue.timezone })
    if (!start.isValid || !end.isValid || end <= start)
      throw new InventoryException('Booking local time is invalid', 'BOOKING_TIME_INVALID', 422)
    return { start, end }
  }

  async createBookingHold(
    trx: TransactionClientContract,
    booking: Booking,
    companyId: number,
    expiresAt: DateTime
  ) {
    if (!booking.spaceId) {
      throw new InventoryException(
        'Booking is not associated with a space',
        'BOOKING_SPACE_REQUIRED',
        409
      )
    }

    const space = await trx
      .from('spaces')
      .join('companies', 'companies.id', 'spaces.company_id')
      .where('spaces.id', booking.spaceId)
      .where('spaces.company_id', companyId)
      .where('spaces.publication_status', 'published')
      .whereNull('spaces.deleted_at')
      .where('companies.status', 'approved')
      .whereNull('companies.deleted_at')
      .select('spaces.*')
      .first()
    if (!space)
      throw new InventoryException(
        'Space cannot be approved in its current state',
        'SPACE_NOT_APPROVABLE',
        409
      )
    await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
      `space-inventory:${space.id}`,
    ])
    const policy = await trx
      .from('space_availability_policies')
      .where('space_id', space.id)
      .where('is_active', true)
      .firstOrFail()
    const { start, end } = await this.bookingRange(trx, booking, space)
    await availabilityPolicyService.assertRequestFitsAvailabilityPolicy(trx, {
      spaceId: space.id,
      startsAt: start,
      endsAt: end,
    })
    const blockedFrom = start.minus({ minutes: policy.preparation_buffer_minutes })
    const blockedUntil = end.plus({ minutes: policy.cleanup_buffer_minutes })
    const [hold] = await trx
      .table('booking_holds')
      .insert({
        company_id: companyId,
        space_id: space.id,
        booking_id: booking.id,
        starts_at: start.toUTC().toSQL(),
        ends_at: end.toUTC().toSQL(),
        expires_at: expiresAt.toUTC().toSQL(),
        created_at: DateTime.now().toSQL(),
      })
      .returning('id')
    try {
      const [block] = await trx
        .table('space_inventory_blocks')
        .insert({
          company_id: companyId,
          space_id: space.id,
          booking_hold_id: hold.id,
          starts_at: start.toUTC().toSQL(),
          ends_at: end.toUTC().toSQL(),
          blocked_from_at: blockedFrom.toUTC().toSQL(),
          blocked_until_at: blockedUntil.toUTC().toSQL(),
          created_at: DateTime.now().toSQL(),
        })
        .returning('id')
      await this.audit(trx, companyId, space.id, block.id, 'booking_hold.created', {
        bookingId: booking.id,
        holdId: hold.id,
      })
      return { holdId: hold.id, blockId: block.id, spaceId: space.id }
    } catch (error) {
      if (isOverlap(error))
        throw new InventoryException(
          'The requested inventory overlaps an active block',
          'INVENTORY_OVERLAP',
          409
        )
      throw error
    }
  }

  async releaseBookingHold(
    trx: TransactionClientContract,
    bookingId: number,
    reason: string,
    holdStatus: 'released' | 'cancelled' | 'expired' = 'released'
  ) {
    const hold = await trx
      .from('booking_holds')
      .where('booking_id', bookingId)
      .where('status', 'active')
      .forUpdate()
      .first()
    if (!hold) return null
    const now = DateTime.now().toSQL()
    await trx.from('booking_holds').where('id', hold.id).update({
      status: holdStatus,
      released_at: now,
      release_reason: reason,
      updated_at: now,
    })
    const block = await trx
      .from('space_inventory_blocks')
      .where('booking_hold_id', hold.id)
      .where('status', 'active')
      .forUpdate()
      .first()
    if (block)
      await trx.from('space_inventory_blocks').where('id', block.id).update({
        status: 'released',
        released_at: now,
        release_reason: reason,
        updated_at: now,
      })
    await this.audit(
      trx,
      hold.company_id,
      hold.space_id,
      block?.id ?? null,
      `booking_hold.${holdStatus}`,
      {
        bookingId,
        holdId: hold.id,
        reason,
      }
    )
    return hold
  }

  async audit(
    trx: TransactionClientContract,
    companyId: number,
    spaceId: number,
    blockId: number | null,
    action: string,
    metadata: unknown,
    actorUserId?: number
  ) {
    await trx.table('space_inventory_events').insert({
      company_id: companyId,
      space_id: spaceId,
      inventory_block_id: blockId,
      actor_user_id: actorUserId ?? null,
      action,
      metadata,
      created_at: DateTime.now().toSQL(),
    })
  }
}

export default new InventoryService()
