import sharp from 'sharp'
import { DateTime } from 'luxon'
import drive from '@adonisjs/drive/services/main'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import type { DemoScenarioContext } from '#database/seeding/scenario_context'
import pricingQuotes from '#services/pricing_quote_service'
import requestWorkflow from '#services/request_workflow_service'
import paymentService from '#services/payment_service'

const PASSWORD = 'password123'
const TIMEZONE = 'Asia/Riyadh'

export const mobileSeedAccounts = {
  customer: 'mohammed@example.com',
  owner: 'royal@example.com',
  manager: 'mobile.manager@qaat.test',
  bookingStaff: 'mobile.booking@qaat.test',
  calendarStaff: 'mobile.calendar@qaat.test',
  accountant: 'mobile.accountant@qaat.test',
} as const

export interface MobileAcceptanceSeed {
  companyId: number
  requestSpaceId: number
  quoteSpaceId: number
  pendingBookingId: number
  paymentReadyBookingId: number
  openInquiryId: number
  answeredInquiryId: number
  submittedVisitId: number
  alternativeVisitId: number
  sentQuoteId: number
  sentQuoteRevisionId: number
  externalReservationId: number
}

function futureSlot(days: number, hour: number, durationHours = 2) {
  const startsAt = DateTime.now().setZone(TIMEZONE).plus({ days }).startOf('day').set({ hour })
  return {
    startsAt,
    endsAt: startsAt.plus({ hours: durationHours }),
  }
}

async function createCompanyMember(
  email: string,
  userName: string,
  companyId: number,
  role: string
) {
  const user = await UserFactory.apply('company', 'verified')
    .merge({ email, userName, password: PASSWORD })
    .create()

  const [membership] = await db
    .table('company_memberships')
    .insert({
      company_id: companyId,
      user_id: user.id,
      role,
      status: 'active',
      joined_at: new Date(),
      created_at: new Date(),
    })
    .returning('*')

  return { user, membership }
}

async function createSeedImage(title: string, subtitle: string, background: string) {
  const overlay = Buffer.from(`
    <svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="800" fill="${background}"/>
      <circle cx="1030" cy="150" r="210" fill="#ffffff" fill-opacity="0.10"/>
      <circle cx="190" cy="720" r="280" fill="#ffffff" fill-opacity="0.08"/>
      <text x="90" y="380" fill="#ffffff" font-size="76" font-family="Arial, sans-serif" font-weight="700">${title}</text>
      <text x="94" y="455" fill="#ffffff" fill-opacity="0.85" font-size="36" font-family="Arial, sans-serif">${subtitle}</text>
    </svg>
  `)

  return sharp(overlay).png().toBuffer()
}

async function addControlledCover(
  companyId: number,
  spaceId: number,
  actorUserId: number,
  filename: string,
  title: string,
  subtitle: string,
  background: string
) {
  const bytes = await createSeedImage(title, subtitle, background)
  const storageKey = `seed/mobile/${filename}`
  await drive.use('private').put(storageKey, bytes)

  const [media] = await db
    .table('space_media')
    .insert({
      space_id: spaceId,
      media_type: 'image',
      storage_key: storageKey,
      mime_type: 'image/png',
      byte_size: bytes.byteLength,
      width: 1200,
      height: 800,
      alt_text_en: title,
      sort_order: 0,
      is_cover: true,
      moderation_status: 'approved',
      created_at: new Date(),
    })
    .returning('*')

  await db.table('space_media_events').insert({
    space_media_id: media.id,
    space_id: spaceId,
    company_id: companyId,
    actor_user_id: actorUserId,
    action: 'seed.approved',
    previous_status: null,
    next_status: 'approved',
    metadata: { seedProfile: 'mobile' },
    created_at: new Date(),
  })
}

async function createSpaces(companyId: number, ownerId: number) {
  const [meetingCategory, weddingCategory] = await Promise.all([
    db.from('space_categories').where('slug', 'meeting_room').firstOrFail(),
    db.from('space_categories').where('slug', 'wedding_hall').firstOrFail(),
  ])
  const now = new Date()
  const [venue] = await db
    .table('venues')
    .insert({
      company_id: companyId,
      name_ar: 'مركز رويال للأعمال والفعاليات',
      name_en: 'Royal Business and Events Center',
      city: 'Riyadh',
      district: 'Al Olaya',
      street: 'King Fahd Road',
      timezone: TIMEZONE,
      verification_status: 'verified',
      created_at: now,
    })
    .returning('*')

  const [requestSpace, quoteSpace] = await db
    .table('spaces')
    .insert([
      {
        company_id: companyId,
        venue_id: venue.id,
        category_id: meetingCategory.id,
        name_ar: 'غرفة رويال للاجتماعات',
        name_en: 'Royal Meeting Room',
        description_en: 'A published hourly meeting room for mobile acceptance testing.',
        booking_mode: 'request_to_book',
        publication_status: 'published',
        capacity_total: 40,
        requires_visit: false,
        minimum_duration_minutes: 60,
        maximum_duration_minutes: 480,
        minimum_notice_hours: 2,
        published_at: now,
        published_by: ownerId,
        created_at: now,
      },
      {
        company_id: companyId,
        venue_id: venue.id,
        category_id: weddingCategory.id,
        name_ar: 'قاعة رويال للاحتفالات',
        name_en: 'Royal Celebration Space',
        description_en: 'A quote-required wedding space with visits and deposit pricing.',
        booking_mode: 'quote_required',
        publication_status: 'published',
        capacity_total: 300,
        requires_visit: true,
        minimum_duration_minutes: 240,
        maximum_duration_minutes: 720,
        minimum_notice_hours: 24,
        published_at: now,
        published_by: ownerId,
        created_at: now,
      },
    ])
    .returning('*')

  await db.table('space_availability_policies').insert([
    {
      company_id: companyId,
      space_id: requestSpace.id,
      mode: 'hourly',
      slot_increment_minutes: 60,
      minimum_duration_minutes: 60,
      maximum_duration_minutes: 480,
      minimum_notice_minutes: 120,
      maximum_advance_days: 365,
      preparation_buffer_minutes: 0,
      cleanup_buffer_minutes: 0,
      created_at: now,
    },
    {
      company_id: companyId,
      space_id: quoteSpace.id,
      mode: 'hourly',
      slot_increment_minutes: 60,
      minimum_duration_minutes: 240,
      maximum_duration_minutes: 720,
      minimum_notice_minutes: 1440,
      maximum_advance_days: 365,
      preparation_buffer_minutes: 60,
      cleanup_buffer_minutes: 60,
      created_at: now,
    },
  ])

  await db.table('space_operating_hours').insert(
    [requestSpace, quoteSpace].flatMap((space) =>
      Array.from({ length: 7 }, (_, weekday) => ({
        company_id: companyId,
        space_id: space.id,
        weekday,
        opens_at_local: '08:00',
        closes_at_local: '23:00',
        ends_next_day: false,
        sort_order: 0,
        created_at: now,
      }))
    )
  )

  await db.table('space_request_settings').insert(
    [requestSpace, quoteSpace].map((space) => ({
      company_id: companyId,
      space_id: space.id,
      booking_response_hours: 48,
      inquiry_response_hours: 24,
      visit_response_hours: 24,
      quote_hold_hours: 48,
      created_at: now,
    }))
  )

  const [requestRate, quoteRate] = await db
    .table('rate_plans')
    .insert([
      {
        company_id: companyId,
        space_id: requestSpace.id,
        name_ar: 'السعر بالساعة',
        name_en: 'Hourly rate',
        pricing_mode: 'hourly',
        price_minor: '10000',
        prices_include_vat: false,
        vat_rate_bps: 1500,
        minimum_duration_minutes: 60,
        maximum_duration_minutes: 480,
        is_active: true,
        created_at: now,
      },
      {
        company_id: companyId,
        space_id: quoteSpace.id,
        name_ar: 'سعر المناسبة',
        name_en: 'Celebration rate',
        pricing_mode: 'full_day',
        price_minor: '500000',
        prices_include_vat: false,
        vat_rate_bps: 1500,
        is_active: true,
        created_at: now,
      },
    ])
    .returning('*')

  const [catering] = await db
    .table('service_options')
    .insert({
      company_id: companyId,
      name_ar: 'ضيافة مميزة',
      name_en: 'Premium catering',
      price_minor: '75000',
      prices_include_vat: false,
      vat_rate_bps: 1500,
      is_active: true,
      created_at: now,
    })
    .returning('*')
  await db.table('space_service_options').insert({
    company_id: companyId,
    space_id: quoteSpace.id,
    service_option_id: catering.id,
    is_active: true,
    created_at: now,
  })

  await Promise.all([
    addControlledCover(
      companyId,
      requestSpace.id,
      ownerId,
      'royal-meeting-room.png',
      'Royal Meeting Room',
      'Request to book · Riyadh',
      '#245B78'
    ),
    addControlledCover(
      companyId,
      quoteSpace.id,
      ownerId,
      'royal-celebration-space.png',
      'Royal Celebration Space',
      'Quote required · Riyadh',
      '#70404F'
    ),
  ])

  return { venue, requestSpace, quoteSpace, requestRate, quoteRate, catering }
}

async function createExternalReservation(companyId: number, spaceId: number, actorUserId: number) {
  const slot = futureSlot(28, 14, 3)
  return db.transaction(async (trx) => {
    const [reservation] = await trx
      .table('external_reservations')
      .insert({
        company_id: companyId,
        space_id: spaceId,
        type: 'internal_event',
        status: 'active',
        starts_at: slot.startsAt.toUTC().toSQL(),
        ends_at: slot.endsAt.toUTC().toSQL(),
        original_start_local: slot.startsAt.toISO({ includeOffset: false }),
        original_end_local: slot.endsAt.toISO({ includeOffset: false }),
        original_timezone: TIMEZONE,
        internal_note: 'Seeded company calendar block',
        created_by_user_id: actorUserId,
        created_at: new Date(),
      })
      .returning('*')
    const [block] = await trx
      .table('space_inventory_blocks')
      .insert({
        company_id: companyId,
        space_id: spaceId,
        external_reservation_id: reservation.id,
        starts_at: reservation.starts_at,
        ends_at: reservation.ends_at,
        blocked_from_at: reservation.starts_at,
        blocked_until_at: reservation.ends_at,
        created_at: new Date(),
      })
      .returning('*')
    await trx.table('space_inventory_events').insert({
      company_id: companyId,
      space_id: spaceId,
      inventory_block_id: block.id,
      actor_user_id: actorUserId,
      action: 'external_reservation.created',
      metadata: { seedProfile: 'mobile' },
      created_at: new Date(),
    })
    return reservation
  })
}

export async function seedMobileAcceptance(
  context: DemoScenarioContext
): Promise<MobileAcceptanceSeed> {
  const customer = context.users.mohammed
  const company = context.companies.royal
  if (!customer || !company) throw new Error('Accounts and companies must be seeded first')

  const owner = await db.from('users').where('id', company.userId).firstOrFail()
  const ownerMembership = await db
    .from('company_memberships')
    .where({ company_id: company.id, user_id: owner.id, role: 'owner', status: 'active' })
    .firstOrFail()

  const [manager, bookingStaff, calendarStaff, accountant] = await Promise.all([
    createCompanyMember(mobileSeedAccounts.manager, 'Mobile Manager', company.id, 'manager'),
    createCompanyMember(
      mobileSeedAccounts.bookingStaff,
      'Mobile Booking Staff',
      company.id,
      'booking_staff'
    ),
    createCompanyMember(
      mobileSeedAccounts.calendarStaff,
      'Mobile Calendar Staff',
      company.id,
      'calendar_staff'
    ),
    createCompanyMember(
      mobileSeedAccounts.accountant,
      'Mobile Accountant',
      company.id,
      'accountant'
    ),
  ])

  const { requestSpace, quoteSpace, requestRate, quoteRate, catering } = await createSpaces(
    company.id,
    owner.id
  )
  await paymentService.createPolicy(company.id, ownerMembership.id, {
    name: 'Mobile acceptance cancellation policy',
    tiers: [
      { minimumHours: 168, refundPercent: 100 },
      { minimumHours: 72, refundPercent: 75 },
      { minimumHours: 0, refundPercent: 50 },
    ],
  })

  const bookingInput = (days: number, key: string) => {
    const slot = futureSlot(days, 10)
    return {
      spaceId: requestSpace.id,
      ratePlanId: requestRate.id,
      startsAt: slot.startsAt.toISO()!,
      endsAt: slot.endsAt.toISO()!,
      eventType: 'business_meeting',
      attendance: 20,
      contactPreference: 'in_app' as const,
      notes: `Mobile acceptance scenario: ${key}`,
      idempotencyKey: key,
    }
  }

  const pendingBooking = await requestWorkflow.createBooking(
    customer.id,
    bookingInput(10, 'mobile-seed-booking-pending')
  )
  await db
    .from('bookings')
    .where('id', pendingBooking.id)
    .update({ request_reference: 'MOB-BR-PENDING' })

  const paymentReadyBooking = await requestWorkflow.createBooking(
    customer.id,
    bookingInput(12, 'mobile-seed-booking-payment-ready')
  )
  await requestWorkflow.approveBooking(paymentReadyBooking.id, company.id, owner.id)
  await db
    .from('bookings')
    .where('id', paymentReadyBooking.id)
    .update({ request_reference: 'MOB-BR-PAYMENT' })

  const inquiryInput = (days: number, key: string, subject: string) => {
    const slot = futureSlot(days, 18, 5)
    return {
      spaceId: quoteSpace.id,
      preferredStartsAt: slot.startsAt.toISO()!,
      preferredEndsAt: slot.endsAt.toISO()!,
      subject,
      message: 'Seeded conversation for customer and company mobile testing.',
      eventType: 'wedding',
      attendance: 180,
      contactPreference: 'in_app' as const,
      idempotencyKey: key,
    }
  }

  const openInquiry = await requestWorkflow.createInquiry(
    customer.id,
    inquiryInput(16, 'mobile-seed-inquiry-open', 'Is this date available?')
  )
  await db.from('space_inquiries').where('id', openInquiry.id).update({ reference: 'MOB-DI-OPEN' })

  const answeredInquiry = await requestWorkflow.createInquiry(
    customer.id,
    inquiryInput(17, 'mobile-seed-inquiry-answered', 'Can you support 180 guests?')
  )
  await requestWorkflow.answerInquiry(company.id, answeredInquiry.id, owner.id, {
    message: 'Yes. The space supports up to 300 guests, and a visit can be arranged.',
  })
  await db
    .from('space_inquiries')
    .where('id', answeredInquiry.id)
    .update({ reference: 'MOB-DI-ANSWERED' })

  const quoteInquiry = await requestWorkflow.createInquiry(
    customer.id,
    inquiryInput(20, 'mobile-seed-inquiry-quote', 'Please send a formal quote')
  )
  await db
    .from('space_inquiries')
    .where('id', quoteInquiry.id)
    .update({ reference: 'MOB-DI-QUOTE' })
  const quote = await pricingQuotes.createQuote(company.id, ownerMembership.id, {
    inquiryId: quoteInquiry.id,
    pricesIncludeVat: false,
    vatRateBps: 1500,
    depositPercent: 50,
    internalNotes: 'Seeded quote ready for customer acceptance.',
    items: [
      { sourceType: 'rate_plan', sourceId: quoteRate.id, quantity: 1 },
      { sourceType: 'service', sourceId: catering.id, quantity: 1 },
    ],
  })
  const sentQuote = await pricingQuotes.sendQuote(company.id, ownerMembership.id, quote.id, 48)
  await db.from('quotes').where('id', quote.id).update({ reference: 'MOB-QT-SENT' })

  const visitSlot = futureSlot(22, 11, 1)
  const submittedVisit = await requestWorkflow.createVisit(customer.id, {
    spaceId: quoteSpace.id,
    inquiryId: openInquiry.id,
    startsAt: visitSlot.startsAt.toISO()!,
    endsAt: visitSlot.endsAt.toISO()!,
    notes: 'Seeded visit awaiting company confirmation.',
    idempotencyKey: 'mobile-seed-visit-submitted',
  })
  await db
    .from('visit_requests')
    .where('id', submittedVisit.id)
    .update({ reference: 'MOB-VR-SUBMITTED' })

  const alternativeOriginal = futureSlot(23, 11, 1)
  const alternativeVisit = await requestWorkflow.createVisit(customer.id, {
    spaceId: quoteSpace.id,
    inquiryId: answeredInquiry.id,
    startsAt: alternativeOriginal.startsAt.toISO()!,
    endsAt: alternativeOriginal.endsAt.toISO()!,
    notes: 'Seeded visit with a company-proposed alternative.',
    idempotencyKey: 'mobile-seed-visit-alternative',
  })
  const alternative = futureSlot(23, 13, 1)
  await requestWorkflow.transitionVisit(company.id, alternativeVisit.id, owner.id, 'confirmed', {
    startsAt: alternative.startsAt.toISO()!,
    endsAt: alternative.endsAt.toISO()!,
    providerNotes: 'Please choose the proposed 1 PM appointment.',
  })
  await db
    .from('visit_requests')
    .where('id', alternativeVisit.id)
    .update({ reference: 'MOB-VR-ALTERNATIVE' })

  const externalReservation = await createExternalReservation(company.id, requestSpace.id, owner.id)

  await db.table('notifications').insert([
    {
      user_id: customer.id,
      type: 'quote_sent',
      title: 'Seeded quote ready',
      message: 'Royal Events sent a quote that is ready for acceptance.',
      data: { quoteId: quote.id, revisionId: sentQuote.current_revision_id },
      read_at: null,
      created_at: new Date(),
    },
    {
      user_id: owner.id,
      company_id: company.id,
      type: 'new_booking_request',
      title: 'Seeded booking awaiting review',
      message: 'A deterministic mobile booking is ready for company action.',
      data: { bookingId: pendingBooking.id, spaceId: requestSpace.id },
      read_at: null,
      created_at: new Date(),
    },
    {
      user_id: manager.user.id,
      company_id: company.id,
      type: 'date_inquiry_received',
      title: 'Seeded inquiry awaiting review',
      message: 'A deterministic date inquiry is ready for company action.',
      data: { inquiryId: openInquiry.id, spaceId: quoteSpace.id },
      read_at: null,
      created_at: new Date(),
    },
    {
      user_id: bookingStaff.user.id,
      company_id: company.id,
      type: 'new_booking_request',
      title: 'Seeded booking awaiting review',
      message: 'A deterministic mobile booking is ready for booking staff.',
      data: { bookingId: pendingBooking.id, spaceId: requestSpace.id },
      read_at: null,
      created_at: new Date(),
    },
    {
      user_id: calendarStaff.user.id,
      company_id: company.id,
      type: 'visit_requested',
      title: 'Seeded visit awaiting review',
      message: 'A deterministic visit is ready for calendar staff.',
      data: { visitId: submittedVisit.id, spaceId: quoteSpace.id },
      read_at: null,
      created_at: new Date(),
    },
    {
      user_id: accountant.user.id,
      company_id: company.id,
      type: 'booking_accepted',
      title: 'Seeded booking awaiting payment',
      message: 'A deterministic accepted booking is ready for finance testing.',
      data: { bookingId: paymentReadyBooking.id, spaceId: requestSpace.id },
      read_at: null,
      created_at: new Date(),
    },
  ])

  return {
    companyId: company.id,
    requestSpaceId: requestSpace.id,
    quoteSpaceId: quoteSpace.id,
    pendingBookingId: pendingBooking.id,
    paymentReadyBookingId: paymentReadyBooking.id,
    openInquiryId: openInquiry.id,
    answeredInquiryId: answeredInquiry.id,
    submittedVisitId: submittedVisit.id,
    alternativeVisitId: alternativeVisit.id,
    sentQuoteId: quote.id,
    sentQuoteRevisionId: sentQuote.current_revision_id,
    externalReservationId: externalReservation.id,
  }
}

export async function verifyMobileAcceptanceSeed(seed: MobileAcceptanceSeed) {
  const checks = await Promise.all([
    db
      .from('spaces')
      .where({
        id: seed.requestSpaceId,
        booking_mode: 'request_to_book',
        publication_status: 'published',
      })
      .first(),
    db
      .from('spaces')
      .where({
        id: seed.quoteSpaceId,
        booking_mode: 'quote_required',
        publication_status: 'published',
      })
      .first(),
    db.from('bookings').where({ id: seed.pendingBookingId, status: 'pending' }).first(),
    db.from('bookings').where({ id: seed.paymentReadyBookingId, status: 'accepted' }).first(),
    db
      .from('booking_holds')
      .where({ booking_id: seed.paymentReadyBookingId, status: 'active' })
      .first(),
    db.from('space_inquiries').where({ id: seed.openInquiryId, status: 'open' }).first(),
    db.from('space_inquiries').where({ id: seed.answeredInquiryId, status: 'answered' }).first(),
    db.from('visit_requests').where({ id: seed.submittedVisitId, status: 'submitted' }).first(),
    db
      .from('visit_requests')
      .where({ id: seed.alternativeVisitId, status: 'alternative_proposed' })
      .first(),
    db.from('quotes').where({ id: seed.sentQuoteId, status: 'sent' }).first(),
    db
      .from('external_reservations')
      .where({ id: seed.externalReservationId, status: 'active' })
      .first(),
  ])

  if (checks.some((row) => !row)) throw new Error('Mobile seed contract verification failed')

  const roles = await db
    .from('company_memberships')
    .where('company_id', seed.companyId)
    .where('status', 'active')
    .whereIn('role', ['owner', 'manager', 'booking_staff', 'calendar_staff', 'accountant'])
    .distinct('role')
  if (roles.length !== 5) throw new Error('Mobile seed role coverage verification failed')

  const media = await db
    .from('space_media')
    .whereIn('space_id', [seed.requestSpaceId, seed.quoteSpaceId])
    .where({ moderation_status: 'approved', is_cover: true })
  if (media.length !== 2) throw new Error('Mobile seed media verification failed')
  for (const item of media) {
    if (!(await drive.use('private').exists(item.storage_key)))
      throw new Error(`Mobile seed media file is missing: ${item.storage_key}`)
  }
}
