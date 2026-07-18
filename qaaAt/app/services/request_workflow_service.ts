import { createHash, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Booking from '#models/booking'
import InventoryException from '#exceptions/inventory_exception'
import availabilityPolicy from '#services/availability_policy_service'
import notificationOutbox from '#services/notification_outbox_service'
import bookingPricing from '#services/booking_pricing_service'
import bookingManagement from '#services/booking_management_service'
import {
  resolvePermissions,
  type CompanyPermission,
  type CompanyRole,
} from '#lib/company_permissions'

type Scope = 'booking_create' | 'inquiry_create' | 'visit_create'

const parseInstant = (value: string, field: string) => {
  const parsed = DateTime.fromISO(value, { setZone: true })
  if (!parsed.isValid || !parsed.isOffsetFixed)
    throw new InventoryException(
      `${field} must include an explicit UTC offset`,
      'REQUEST_TIME_INVALID',
      422
    )
  return parsed
}

const assertFutureInterval = (startsAt: DateTime, endsAt: DateTime, now = DateTime.now()) => {
  if (endsAt.toMillis() <= startsAt.toMillis() || startsAt.toMillis() <= now.toMillis())
    throw new InventoryException(
      'Visit start must be in the future and end must follow start',
      'REQUEST_TIME_INVALID',
      422
    )
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

const minorToMajor = (value: string) => {
  const minor = BigInt(value)
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`
}

export class RequestWorkflowService {
  private async publicSpace(client: any, spaceId: number) {
    const space = await client
      .from('spaces')
      .join('venues', 'venues.id', 'spaces.venue_id')
      .join('companies', 'companies.id', 'spaces.company_id')
      .join('space_categories', 'space_categories.id', 'spaces.category_id')
      .where('spaces.id', spaceId)
      .where('spaces.publication_status', 'published')
      .whereNull('spaces.deleted_at')
      .where('companies.status', 'approved')
      .whereNull('companies.deleted_at')
      .select(
        'spaces.*',
        'venues.timezone',
        'venues.name_ar as venue_name_ar',
        'venues.name_en as venue_name_en',
        'space_categories.slug as category_slug'
      )
      .first()
    if (!space) throw new InventoryException('Published Space not found', 'SPACE_NOT_BOOKABLE', 404)
    return space
  }

  private async responseHours(client: any, space: any, type: 'booking' | 'inquiry' | 'visit') {
    const setting = await client.from('space_request_settings').where('space_id', space.id).first()
    const category = await client
      .from('category_request_response_policies')
      .where('category_id', space.category_id)
      .firstOrFail()
    return Number(
      setting?.[`${type}_response_hours`] ??
        category[
          type === 'booking'
            ? 'request_to_book_hours'
            : type === 'inquiry'
              ? 'date_inquiry_hours'
              : 'visit_hours'
        ]
    )
  }

  private async companyRecipients(client: any, companyId: number, permission: CompanyPermission) {
    const memberships = await client
      .from('company_memberships')
      .where('company_id', companyId)
      .where('status', 'active')
      .select('id', 'user_id', 'role')
    if (!memberships.length) return []
    const overrides = await client.from('company_membership_permissions').whereIn(
      'company_membership_id',
      memberships.map((membership: any) => membership.id)
    )
    const recipients = new Set<number>()
    for (const membership of memberships) {
      const effective = resolvePermissions(
        membership.role as CompanyRole,
        overrides
          .filter((item: any) => item.company_membership_id === membership.id)
          .map((item: any) => ({ permission: item.permission, effect: item.effect }))
      )
      if (effective.includes(permission)) recipients.add(membership.user_id)
    }
    return [...recipients]
  }

  private async notifyCompany(
    client: any,
    companyId: number,
    permission: CompanyPermission,
    payload: Omit<
      Parameters<typeof notificationOutbox.enqueue>[0],
      'clientContext' | 'companyId' | 'userId'
    >
  ) {
    const recipients = await this.companyRecipients(client, companyId, permission)
    for (const userId of recipients)
      await notificationOutbox.enqueue(
        { ...payload, userId, clientContext: 'company_app', companyId },
        client
      )
  }

  private async idempotent(
    client: any,
    userId: number,
    scope: Scope,
    key: string,
    requestHash: string
  ) {
    await client.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
      `request:${userId}:${scope}:${key}`,
    ])
    const existing = await client
      .from('request_idempotency_keys')
      .where('user_id', userId)
      .where('scope', scope)
      .where('idempotency_key', key)
      .first()
    if (!existing) return null
    if (existing.request_hash !== requestHash)
      throw new InventoryException(
        'Idempotency key was reused with a different payload',
        'IDEMPOTENCY_KEY_REUSED',
        409
      )
    return existing
  }

  private async remember(
    client: any,
    userId: number,
    scope: Scope,
    key: string,
    requestHash: string,
    resourceType: string,
    resourceId: number
  ) {
    await client.table('request_idempotency_keys').insert({
      user_id: userId,
      scope,
      idempotency_key: key,
      request_hash: requestHash,
      resource_type: resourceType,
      resource_id: resourceId,
      expires_at: DateTime.now().plus({ days: 2 }).toSQL(),
      created_at: DateTime.now().toSQL(),
    })
  }

  async createBooking(userId: number, input: any) {
    const requestHash = hash(input)
    return db.transaction(async (trx) => {
      const replay = await this.idempotent(
        trx,
        userId,
        'booking_create',
        input.idempotencyKey,
        requestHash
      )
      if (replay) return Booking.findOrFail(replay.resource_id, { client: trx })
      const space = await this.publicSpace(trx, input.spaceId)
      if (space.booking_mode !== 'request_to_book')
        throw new InventoryException(
          'Space requires a date inquiry',
          'SPACE_BOOKING_MODE_MISMATCH',
          409
        )
      const startsAt = parseInstant(input.startsAt, 'startsAt')
      const endsAt = parseInstant(input.endsAt, 'endsAt')
      await availabilityPolicy.assertRequestFitsAvailabilityPolicy(trx, {
        spaceId: space.id,
        startsAt,
        endsAt,
        sessionCode: input.sessionCode,
      })
      const pricingSnapshot = await bookingPricing.resolve(trx, {
        companyId: space.company_id,
        spaceId: space.id,
        ratePlanId: input.ratePlanId,
        startsAt,
        endsAt,
        sessionCode: input.sessionCode,
      })
      const localStart = startsAt.setZone(space.timezone)
      const localEnd = endsAt.setZone(space.timezone)
      const user = await trx
        .from('users')
        .leftJoin('user_profiles', 'user_profiles.user_id', 'users.id')
        .where('users.id', userId)
        .select(
          'users.email',
          'users.user_name',
          'user_profiles.first_name',
          'user_profiles.last_name',
          'user_profiles.phone'
        )
        .firstOrFail()
      const responseExpiresAt = DateTime.now().plus({
        hours: await this.responseHours(trx, space, 'booking'),
      })
      const booking = await Booking.create(
        {
          userId,
          companyId: space.company_id,
          venueId: space.venue_id,
          spaceId: space.id,
          requestReference: `BR-${randomUUID()}`,
          bookingDate: localStart.startOf('day'),
          startTime: localStart.toFormat('HH:mm'),
          endTime: localEnd.toFormat('HH:mm'),
          totalPrice: minorToMajor(pricingSnapshot.totalMinor),
          specialRequests: input.notes ?? null,
          status: 'pending',
          paymentStatus: 'unpaid',
          expiresAt: responseExpiresAt,
          responseExpiresAt,
          submittedAt: DateTime.now(),
          spaceNameSnapshotAr: space.name_ar,
          spaceNameSnapshotEn: space.name_en,
          venueNameSnapshotAr: space.venue_name_ar,
          venueNameSnapshotEn: space.venue_name_en,
          categorySlugSnapshot: space.category_slug,
          customerNameSnapshot:
            [user.first_name, user.last_name].filter(Boolean).join(' ') || user.user_name,
          customerEmailSnapshot: user.email,
          customerPhoneSnapshot: input.contactPreference === 'phone' ? user.phone : null,
          contactPreference: input.contactPreference,
          eventType: input.eventType,
          attendance: input.attendance,
          sessionCode: input.sessionCode ?? null,
          startsAt: startsAt.toUTC(),
          endsAt: endsAt.toUTC(),
          originalStartLocal: localStart.toISO({ includeOffset: false })!,
          originalEndLocal: localEnd.toISO({ includeOffset: false })!,
          originalTimezone: space.timezone,
          categoryRequirements: null,
        },
        { client: trx }
      )
      await bookingPricing.persist(trx, booking.id, pricingSnapshot)
      await trx.table('booking_audit_logs').insert({
        actor_user_id: userId,
        booking_id: booking.id,
        company_id: space.company_id,
        action: 'booking.submit',
        previous_status: 'pending',
        next_status: 'pending',
        metadata: { spaceId: space.id, source: 'space_api' },
        created_at: DateTime.now().toSQL(),
      })
      await this.notifyCompany(trx, space.company_id, 'booking_requests.view', {
        type: 'new_booking_request',
        title: 'طلب حجز جديد',
        message: `طلب حجز جديد للمساحة ${space.name_ar ?? space.name_en}`,
        data: { bookingId: booking.id, spaceId: space.id },
        sendEmail: true,
        emailSubject: 'طلب حجز جديد - قاعات',
      })
      await this.remember(
        trx,
        userId,
        'booking_create',
        input.idempotencyKey,
        requestHash,
        'booking',
        booking.id
      )
      return booking
    })
  }

  listUserBookings(userId: number, page: number, limit: number) {
    return Booking.query()
      .where('userId', userId)
      .whereNull('deletedAt')
      .orderBy('createdAt', 'desc')
      .paginate(page, limit)
  }
  listCompanyBookings(companyId: number, page: number, limit: number, status?: string) {
    const query = Booking.query()
      .where('companyId', companyId)
      .whereNull('deletedAt')
      .orderBy('submittedAt', 'desc')
    if (status) query.where('status', status)
    return query.paginate(page, limit)
  }
  async getUserBooking(userId: number, id: number) {
    return Booking.query()
      .where('id', id)
      .where('userId', userId)
      .whereNull('deletedAt')
      .firstOrFail()
  }
  async getCompanyBooking(companyId: number, id: number) {
    return Booking.query()
      .where('id', id)
      .where('companyId', companyId)
      .whereNull('deletedAt')
      .firstOrFail()
  }
  approveBooking(id: number, companyId: number, actorUserId: number) {
    return bookingManagement.acceptBooking(id, companyId, actorUserId)
  }
  rejectBooking(id: number, companyId: number, actorUserId: number, reason: string) {
    return bookingManagement.rejectBooking(id, companyId, actorUserId, reason)
  }
  cancelBookingByCompany(id: number, companyId: number, actorUserId: number, reason: string) {
    return bookingManagement.cancelBookingByCompany(id, companyId, actorUserId, reason)
  }
  cancelBookingByUser(id: number, userId: number) {
    return bookingManagement.cancelBooking(id, userId)
  }

  async createInquiry(userId: number, input: any) {
    const requestHash = hash(input)
    return db.transaction(async (trx) => {
      const replay = await this.idempotent(
        trx,
        userId,
        'inquiry_create',
        input.idempotencyKey,
        requestHash
      )
      if (replay) return trx.from('space_inquiries').where('id', replay.resource_id).firstOrFail()
      const space = await this.publicSpace(trx, input.spaceId)
      if (space.booking_mode !== 'quote_required')
        throw new InventoryException(
          'Space does not use the inquiry and quote workflow',
          'SPACE_INQUIRY_MODE_MISMATCH',
          409
        )
      const start = parseInstant(input.preferredStartsAt, 'preferredStartsAt')
      const end = parseInstant(input.preferredEndsAt, 'preferredEndsAt')
      if (end <= start)
        throw new InventoryException('Inquiry end must follow start', 'REQUEST_TIME_INVALID', 422)
      const user = await trx
        .from('users')
        .leftJoin('user_profiles', 'user_profiles.user_id', 'users.id')
        .where('users.id', userId)
        .select(
          'users.email',
          'users.user_name',
          'user_profiles.first_name',
          'user_profiles.last_name'
        )
        .firstOrFail()
      const [row] = await trx
        .table('space_inquiries')
        .insert({
          reference: `DI-${randomUUID()}`,
          company_id: space.company_id,
          venue_id: space.venue_id,
          space_id: space.id,
          user_id: userId,
          subject: input.subject,
          initial_message: input.message ?? null,
          event_type: input.eventType ?? null,
          attendance: input.attendance ?? null,
          preferred_starts_at: start.toUTC().toSQL(),
          preferred_ends_at: end.toUTC().toSQL(),
          original_start_local: start.setZone(space.timezone).toISO({ includeOffset: false }),
          original_end_local: end.setZone(space.timezone).toISO({ includeOffset: false }),
          original_timezone: space.timezone,
          space_name_snapshot_ar: space.name_ar,
          space_name_snapshot_en: space.name_en,
          venue_name_snapshot_ar: space.venue_name_ar,
          venue_name_snapshot_en: space.venue_name_en,
          customer_name_snapshot:
            [user.first_name, user.last_name].filter(Boolean).join(' ') || user.user_name,
          customer_email_snapshot: user.email,
          contact_preference: input.contactPreference,
          response_expires_at: DateTime.now()
            .plus({ hours: await this.responseHours(trx, space, 'inquiry') })
            .toSQL(),
          created_at: DateTime.now().toSQL(),
        })
        .returning('*')
      await trx.table('inquiry_events').insert({
        inquiry_id: row.id,
        company_id: space.company_id,
        actor_user_id: userId,
        action: 'inquiry.submit',
        previous_status: null,
        next_status: 'open',
        created_at: DateTime.now().toSQL(),
      })
      await this.notifyCompany(trx, space.company_id, 'inquiries.view', {
        type: 'date_inquiry_received',
        title: 'استفسار موعد جديد',
        message: input.subject,
        data: { inquiryId: row.id, spaceId: space.id },
      })
      await this.remember(
        trx,
        userId,
        'inquiry_create',
        input.idempotencyKey,
        requestHash,
        'inquiry',
        row.id
      )
      return row
    })
  }

  listInquiries(actor: 'user' | 'company', id: number, page: number, limit: number) {
    return db
      .from('space_inquiries')
      .where(actor === 'user' ? 'user_id' : 'company_id', id)
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
  }
  async getInquiry(actor: 'user' | 'company', id: number, inquiryId: number) {
    return db
      .from('space_inquiries')
      .where('id', inquiryId)
      .where(actor === 'user' ? 'user_id' : 'company_id', id)
      .whereNull('deleted_at')
      .firstOrFail()
  }

  async listInquiryMessages(
    actor: 'user' | 'company',
    id: number,
    inquiryId: number,
    page: number,
    limit: number
  ) {
    const inquiry = await this.getInquiry(actor, id, inquiryId)
    return db
      .from('inquiry_messages')
      .where('inquiry_id', inquiry.id)
      .where('company_id', inquiry.company_id)
      .select('id', 'sender_type', 'body', 'created_at')
      .orderBy('created_at', 'asc')
      .paginate(page, Math.min(100, limit))
  }

  async answerInquiry(companyId: number, inquiryId: number, actorUserId: number, input: any) {
    return db.transaction(async (trx) => {
      const row = await trx
        .from('space_inquiries')
        .where('id', inquiryId)
        .where('company_id', companyId)
        .forUpdate()
        .firstOrFail()
      if (!['open', 'under_review'].includes(row.status))
        throw new InventoryException(
          'Inquiry cannot be answered',
          'INQUIRY_INVALID_TRANSITION',
          409
        )
      if (input.lockVersion && input.lockVersion !== row.lock_version)
        throw new InventoryException(
          'Inquiry changed; refresh and retry',
          'REQUEST_VERSION_CONFLICT',
          409
        )
      await trx.table('inquiry_messages').insert({
        inquiry_id: row.id,
        company_id: companyId,
        sender_user_id: actorUserId,
        sender_type: 'company_member',
        body: input.message,
        created_at: DateTime.now().toSQL(),
      })
      await trx
        .from('space_inquiries')
        .where('id', row.id)
        .update({
          status: 'answered',
          answered_at: DateTime.now().toSQL(),
          lock_version: row.lock_version + 1,
          updated_at: DateTime.now().toSQL(),
        })
      await trx.table('inquiry_events').insert({
        inquiry_id: row.id,
        company_id: companyId,
        actor_user_id: actorUserId,
        action: 'inquiry.answer',
        previous_status: row.status,
        next_status: 'answered',
        created_at: DateTime.now().toSQL(),
      })
      await notificationOutbox.enqueue(
        {
          userId: row.user_id,
          clientContext: 'customer_app',
          type: 'date_inquiry_answered',
          title: 'تم الرد على استفسارك',
          message: input.message,
          data: { inquiryId: row.id },
        },
        trx
      )
      return trx.from('space_inquiries').where('id', row.id).firstOrFail()
    })
  }

  async cancelInquiry(userId: number, inquiryId: number) {
    return db.transaction(async (trx) => {
      const row = await trx
        .from('space_inquiries')
        .where('id', inquiryId)
        .where('user_id', userId)
        .forUpdate()
        .firstOrFail()
      if (!['open', 'under_review', 'answered'].includes(row.status))
        throw new InventoryException(
          'Inquiry cannot be cancelled',
          'INQUIRY_INVALID_TRANSITION',
          409
        )
      await trx
        .from('space_inquiries')
        .where('id', row.id)
        .update({
          status: 'cancelled',
          cancelled_at: DateTime.now().toSQL(),
          lock_version: row.lock_version + 1,
          updated_at: DateTime.now().toSQL(),
        })
      await trx.table('inquiry_events').insert({
        inquiry_id: row.id,
        company_id: row.company_id,
        actor_user_id: userId,
        action: 'inquiry.cancel',
        previous_status: row.status,
        next_status: 'cancelled',
        created_at: DateTime.now().toSQL(),
      })
      await this.notifyCompany(trx, row.company_id, 'inquiries.view', {
        type: 'date_inquiry_cancelled',
        title: 'تم إلغاء استفسار الموعد',
        message: 'ألغى العميل استفسار الموعد',
        data: { inquiryId: row.id },
      })
      return trx.from('space_inquiries').where('id', row.id).firstOrFail()
    })
  }

  async transitionInquiry(
    companyId: number,
    inquiryId: number,
    actorUserId: number,
    next: 'under_review' | 'rejected' | 'closed',
    reason?: string
  ) {
    const allowed: Record<string, string[]> = {
      open: ['under_review', 'rejected'],
      under_review: ['rejected'],
      answered: ['closed'],
    }
    return db.transaction(async (trx) => {
      const row = await trx
        .from('space_inquiries')
        .where('id', inquiryId)
        .where('company_id', companyId)
        .forUpdate()
        .firstOrFail()
      if (!allowed[row.status]?.includes(next))
        throw new InventoryException(
          'Inquiry transition is not allowed',
          'INQUIRY_INVALID_TRANSITION',
          409
        )
      const now = DateTime.now().toSQL()
      await trx
        .from('space_inquiries')
        .where('id', row.id)
        .update({
          status: next,
          closed_at: next === 'closed' ? now : row.closed_at,
          lock_version: row.lock_version + 1,
          updated_at: now,
        })
      await trx.table('inquiry_events').insert({
        inquiry_id: row.id,
        company_id: companyId,
        actor_user_id: actorUserId,
        action: `inquiry.${next}`,
        previous_status: row.status,
        next_status: next,
        reason: reason ?? null,
        created_at: now,
      })
      await notificationOutbox.enqueue(
        {
          userId: row.user_id,
          clientContext: 'customer_app',
          type: 'date_inquiry_answered',
          title: 'تحديث استفسار الموعد',
          message: reason ?? `حالة الاستفسار: ${next}`,
          data: { inquiryId: row.id, status: next },
        },
        trx
      )
      return trx.from('space_inquiries').where('id', row.id).firstOrFail()
    })
  }

  async createVisit(userId: number, input: any) {
    const requestHash = hash(input)
    return db.transaction(async (trx) => {
      const replay = await this.idempotent(
        trx,
        userId,
        'visit_create',
        input.idempotencyKey,
        requestHash
      )
      if (replay) return trx.from('visit_requests').where('id', replay.resource_id).firstOrFail()
      const space = await this.publicSpace(trx, input.spaceId)
      if (input.inquiryId)
        await trx
          .from('space_inquiries')
          .where('id', input.inquiryId)
          .where('user_id', userId)
          .where('company_id', space.company_id)
          .where('space_id', space.id)
          .firstOrFail()
      if (input.bookingId)
        await trx
          .from('bookings')
          .where('id', input.bookingId)
          .where('user_id', userId)
          .where('company_id', space.company_id)
          .where('space_id', space.id)
          .firstOrFail()
      const start = parseInstant(input.startsAt, 'startsAt')
      const end = parseInstant(input.endsAt, 'endsAt')
      if (end <= start || start <= DateTime.now())
        throw new InventoryException('Visit interval is invalid', 'REQUEST_TIME_INVALID', 422)
      const user = await trx.from('users').where('id', userId).firstOrFail()
      const [row] = await trx
        .table('visit_requests')
        .insert({
          reference: `VR-${randomUUID()}`,
          company_id: space.company_id,
          venue_id: space.venue_id,
          space_id: space.id,
          user_id: userId,
          inquiry_id: input.inquiryId ?? null,
          booking_id: input.bookingId ?? null,
          starts_at: start.toUTC().toSQL(),
          ends_at: end.toUTC().toSQL(),
          original_start_local: start.setZone(space.timezone).toISO({ includeOffset: false }),
          original_end_local: end.setZone(space.timezone).toISO({ includeOffset: false }),
          original_timezone: space.timezone,
          customer_name_snapshot: user.user_name,
          customer_email_snapshot: user.email,
          customer_notes: input.notes ?? null,
          response_expires_at: DateTime.now()
            .plus({ hours: await this.responseHours(trx, space, 'visit') })
            .toSQL(),
          created_at: DateTime.now().toSQL(),
        })
        .returning('*')
      await trx.table('visit_events').insert({
        visit_id: row.id,
        company_id: space.company_id,
        actor_user_id: userId,
        action: 'visit.submit',
        previous_status: null,
        next_status: 'submitted',
        created_at: DateTime.now().toSQL(),
      })
      await this.notifyCompany(trx, space.company_id, 'visits.view', {
        type: 'visit_requested',
        title: 'طلب زيارة جديد',
        message: 'وصل طلب زيارة جديد',
        data: { visitId: row.id, spaceId: space.id },
      })
      await this.remember(
        trx,
        userId,
        'visit_create',
        input.idempotencyKey,
        requestHash,
        'visit',
        row.id
      )
      return row
    })
  }

  listVisits(actor: 'user' | 'company', id: number, page: number, limit: number) {
    return db
      .from('visit_requests')
      .where(actor === 'user' ? 'user_id' : 'company_id', id)
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
  }
  async getVisit(actor: 'user' | 'company', id: number, visitId: number) {
    return db
      .from('visit_requests')
      .where('id', visitId)
      .where(actor === 'user' ? 'user_id' : 'company_id', id)
      .whereNull('deleted_at')
      .firstOrFail()
  }

  async transitionVisit(
    companyId: number,
    visitId: number,
    actorUserId: number,
    next: string,
    input: any = {}
  ) {
    const allowed: Record<string, string[]> = {
      submitted: ['confirmed', 'rejected', 'cancelled'],
      confirmed: ['completed', 'cancelled', 'no_show'],
    }
    return db.transaction(async (trx) => {
      const row = await trx
        .from('visit_requests')
        .where('id', visitId)
        .where('company_id', companyId)
        .forUpdate()
        .firstOrFail()
      if (!allowed[row.status]?.includes(next))
        throw new InventoryException(
          'Visit transition is not allowed',
          'VISIT_INVALID_TRANSITION',
          409
        )
      if (input.lockVersion && input.lockVersion !== row.lock_version)
        throw new InventoryException(
          'Visit changed; refresh and retry',
          'REQUEST_VERSION_CONFLICT',
          409
        )
      if ((input.startsAt && !input.endsAt) || (!input.startsAt && input.endsAt))
        throw new InventoryException(
          'Alternative visit time requires both startsAt and endsAt',
          'REQUEST_TIME_INVALID',
          422
        )
      const startsAt = input.startsAt
        ? parseInstant(input.startsAt, 'startsAt')
        : DateTime.fromJSDate(row.starts_at)
      const endsAt = input.endsAt
        ? parseInstant(input.endsAt, 'endsAt')
        : DateTime.fromJSDate(row.ends_at)
      const changedInterval =
        next === 'confirmed' &&
        (startsAt.toUTC().toMillis() !== DateTime.fromJSDate(row.starts_at).toUTC().toMillis() ||
          endsAt.toUTC().toMillis() !== DateTime.fromJSDate(row.ends_at).toUTC().toMillis())
      const resultingStatus = changedInterval ? 'alternative_proposed' : next
      if (next === 'confirmed') {
        assertFutureInterval(startsAt, endsAt)
      }
      if (next === 'confirmed' && !changedInterval) {
        await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
          `venue-visits:${row.venue_id}`,
        ])
        const overlap = await trx
          .from('visit_requests')
          .where('venue_id', row.venue_id)
          .where('status', 'confirmed')
          .whereNot('id', row.id)
          .where('starts_at', '<', endsAt.toSQL()!)
          .where('ends_at', '>', startsAt.toSQL()!)
          .first()
        if (overlap)
          throw new InventoryException(
            'Another confirmed visit overlaps this appointment',
            'VISIT_TIME_CONFLICT',
            409
          )
      }
      const now = DateTime.now().toSQL()
      await trx
        .from('visit_requests')
        .where('id', row.id)
        .update({
          status: resultingStatus,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          proposed_starts_at: changedInterval ? startsAt.toUTC().toSQL() : null,
          proposed_ends_at: changedInterval ? endsAt.toUTC().toSQL() : null,
          proposed_start_local: changedInterval ? input.startsAt : null,
          proposed_end_local: changedInterval ? input.endsAt : null,
          provider_notes: input.providerNotes ?? row.provider_notes,
          status_reason: input.reason ?? null,
          confirmed_at: resultingStatus === 'confirmed' ? now : row.confirmed_at,
          completed_at: next === 'completed' ? now : row.completed_at,
          cancelled_at: next === 'cancelled' ? now : row.cancelled_at,
          lock_version: row.lock_version + 1,
          updated_at: now,
        })
      await trx.table('visit_events').insert({
        visit_id: row.id,
        company_id: companyId,
        actor_user_id: actorUserId,
        action: `visit.${resultingStatus}`,
        previous_status: row.status,
        next_status: resultingStatus,
        reason: input.reason ?? null,
        created_at: now,
      })
      await notificationOutbox.enqueue(
        {
          userId: row.user_id,
          clientContext: 'customer_app',
          type: changedInterval ? 'visit_alternative_proposed' : (`visit_${next}` as any),
          title: 'تحديث طلب الزيارة',
          message: input.reason ?? `حالة الزيارة: ${next}`,
          data: { visitId: row.id, status: resultingStatus },
        },
        trx
      )
      return trx.from('visit_requests').where('id', row.id).firstOrFail()
    })
  }

  async cancelVisit(userId: number, visitId: number) {
    return db.transaction(async (trx) => {
      const row = await trx
        .from('visit_requests')
        .where('id', visitId)
        .where('user_id', userId)
        .forUpdate()
        .firstOrFail()
      if (!['submitted', 'alternative_proposed', 'confirmed'].includes(row.status))
        throw new InventoryException('Visit cannot be cancelled', 'VISIT_INVALID_TRANSITION', 409)
      const now = DateTime.now().toSQL()
      await trx
        .from('visit_requests')
        .where('id', row.id)
        .update({
          status: 'cancelled',
          cancelled_at: now,
          lock_version: row.lock_version + 1,
          updated_at: now,
        })
      await trx.table('visit_events').insert({
        visit_id: row.id,
        company_id: row.company_id,
        actor_user_id: userId,
        action: 'visit.cancel',
        previous_status: row.status,
        next_status: 'cancelled',
        created_at: now,
      })
      await this.notifyCompany(trx, row.company_id, 'visits.view', {
        type: 'visit_cancelled',
        title: 'تم إلغاء طلب الزيارة',
        message: 'ألغى العميل طلب الزيارة',
        data: { visitId: row.id },
      })
      return trx.from('visit_requests').where('id', row.id).firstOrFail()
    })
  }

  async acceptVisitAlternative(userId: number, visitId: number) {
    return db.transaction(async (trx) => {
      const row = await trx
        .from('visit_requests')
        .where('id', visitId)
        .where('user_id', userId)
        .where('status', 'alternative_proposed')
        .forUpdate()
        .firstOrFail()
      if (!row.proposed_starts_at || !row.proposed_ends_at)
        throw new InventoryException(
          'Alternative visit time is incomplete',
          'REQUEST_TIME_INVALID',
          422
        )
      const proposedStartsAt = DateTime.fromJSDate(row.proposed_starts_at)
      const proposedEndsAt = DateTime.fromJSDate(row.proposed_ends_at)
      assertFutureInterval(proposedStartsAt, proposedEndsAt)
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
        `venue-visits:${row.venue_id}`,
      ])
      const overlap = await trx
        .from('visit_requests')
        .where('venue_id', row.venue_id)
        .where('status', 'confirmed')
        .whereNot('id', row.id)
        .where('starts_at', '<', proposedEndsAt.toUTC().toSQL()!)
        .where('ends_at', '>', proposedStartsAt.toUTC().toSQL()!)
        .first()
      if (overlap)
        throw new InventoryException(
          'Another confirmed visit overlaps the proposed appointment',
          'VISIT_TIME_CONFLICT',
          409
        )
      const now = DateTime.now().toSQL()
      await trx
        .from('visit_requests')
        .where('id', row.id)
        .update({
          status: 'confirmed',
          starts_at: row.proposed_starts_at,
          ends_at: row.proposed_ends_at,
          original_start_local: row.proposed_start_local,
          original_end_local: row.proposed_end_local,
          proposed_starts_at: null,
          proposed_ends_at: null,
          proposed_start_local: null,
          proposed_end_local: null,
          confirmed_at: now,
          lock_version: row.lock_version + 1,
          updated_at: now,
        })
      await trx.table('visit_events').insert({
        visit_id: row.id,
        company_id: row.company_id,
        actor_user_id: userId,
        action: 'visit.alternative_accepted',
        previous_status: 'alternative_proposed',
        next_status: 'confirmed',
        created_at: now,
      })
      await this.notifyCompany(trx, row.company_id, 'visits.view', {
        type: 'visit_alternative_accepted',
        title: 'تم قبول الموعد البديل',
        message: 'وافق العميل على موعد الزيارة البديل',
        data: { visitId: row.id },
      })
      return trx.from('visit_requests').where('id', row.id).firstOrFail()
    })
  }

  async rejectVisitAlternative(userId: number, visitId: number) {
    return db.transaction(async (trx) => {
      const row = await trx
        .from('visit_requests')
        .where('id', visitId)
        .where('user_id', userId)
        .where('status', 'alternative_proposed')
        .forUpdate()
        .firstOrFail()
      const now = DateTime.now().toSQL()
      await trx
        .from('visit_requests')
        .where('id', row.id)
        .update({
          status: 'cancelled',
          cancelled_at: now,
          lock_version: row.lock_version + 1,
          updated_at: now,
        })
      await trx.table('visit_events').insert({
        visit_id: row.id,
        company_id: row.company_id,
        actor_user_id: userId,
        action: 'visit.alternative_rejected',
        previous_status: 'alternative_proposed',
        next_status: 'cancelled',
        created_at: now,
      })
      await this.notifyCompany(trx, row.company_id, 'visits.view', {
        type: 'visit_alternative_rejected',
        title: 'تم رفض الموعد البديل',
        message: 'رفض العميل موعد الزيارة البديل',
        data: { visitId: row.id },
      })
      return trx.from('visit_requests').where('id', row.id).firstOrFail()
    })
  }

  async expirePending(limit = 100) {
    return db.transaction(async (trx) => {
      const now = DateTime.now().toSQL()
      const inquiries = await trx
        .from('space_inquiries')
        .whereIn('status', ['open', 'under_review'])
        .where('response_expires_at', '<=', now)
        .forUpdate()
        .skipLocked()
        .limit(limit)
      for (const row of inquiries) {
        await trx
          .from('space_inquiries')
          .where('id', row.id)
          .update({ status: 'expired', updated_at: now })
        await trx.table('inquiry_events').insert({
          inquiry_id: row.id,
          company_id: row.company_id,
          actor_user_id: null,
          action: 'inquiry.expire',
          previous_status: row.status,
          next_status: 'expired',
          created_at: now,
        })
        await notificationOutbox.enqueue(
          {
            userId: row.user_id,
            clientContext: 'customer_app',
            type: 'date_inquiry_expired',
            title: 'انتهت مهلة استفسار الموعد',
            message: 'لم يرد المزود خلال المهلة المحددة',
            data: { inquiryId: row.id },
          },
          trx
        )
      }
      const remaining = Math.max(0, limit - inquiries.length)
      const visits = remaining
        ? await trx
            .from('visit_requests')
            .where('status', 'submitted')
            .where('response_expires_at', '<=', now)
            .forUpdate()
            .skipLocked()
            .limit(remaining)
        : []
      for (const row of visits) {
        await trx
          .from('visit_requests')
          .where('id', row.id)
          .update({ status: 'expired', updated_at: now })
        await trx.table('visit_events').insert({
          visit_id: row.id,
          company_id: row.company_id,
          actor_user_id: null,
          action: 'visit.expire',
          previous_status: row.status,
          next_status: 'expired',
          created_at: now,
        })
        await notificationOutbox.enqueue(
          {
            userId: row.user_id,
            clientContext: 'customer_app',
            type: 'visit_expired',
            title: 'انتهت مهلة طلب الزيارة',
            message: 'لم يؤكد المزود طلب الزيارة خلال المهلة المحددة',
            data: { visitId: row.id },
          },
          trx
        )
      }
      return inquiries.length + visits.length
    })
  }
}

export default new RequestWorkflowService()
