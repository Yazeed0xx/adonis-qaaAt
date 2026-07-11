import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import assert from 'node:assert/strict'
import User from '#models/user'
import { UserFactory } from '#database/factories/user_factory'
import { CompanyFactory } from '#database/factories/company_factory'
import { HallFactory } from '#database/factories/hall_factory'
import { ServiceFactory } from '#database/factories/service_factory'
import { BookingFactory } from '#database/factories/booking_factory'
import bookingManagementService from '#services/booking_management_service'
import notificationOutboxService from '#services/notification_outbox_service'

async function createCompany(status: 'approved' | 'suspended' = 'approved') {
  const owner = await UserFactory.apply('company', 'verified').create()
  const company = await CompanyFactory.apply(status).merge({ userId: owner.id }).create()
  const hall = await HallFactory.merge({ companyId: company.id, isAvailable: true }).create()

  return { owner, company, hall }
}

test.group('P1 backend security hardening', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('access tokens expire and company suspension revokes existing tokens', async ({
    client,
  }) => {
    const admin = await UserFactory.apply('admin', 'verified').create()
    const { owner, company } = await createCompany('approved')
    const token = await User.accessTokens.create(owner)
    await db.table('push_installations').insert({
      user_id: owner.id,
      installation_id: 'suspended-company-device',
      expo_push_token: 'ExponentPushToken[suspended-company-device]',
      platform: 'ios',
      notifications_enabled: true,
      last_seen_at: DateTime.now().toSQL(),
    })

    assert.ok(token.expiresAt)
    assert.ok(token.expiresAt.getTime() > Date.now() + 29 * 24 * 60 * 60 * 1000)

    const response = await client
      .post(`/api/admin/companies/${company.id}/suspend`)
      .withGuard('api')
      .loginAs(admin)
      .json({ reason: 'Repeated policy violations' })

    response.assertStatus(200)

    const remainingTokens = await db
      .from('auth_access_tokens')
      .where('tokenable_id', owner.id)
      .count('* as total')
      .first()
    assert.equal(Number(remainingTokens?.total), 0)
    const installation = await db
      .from('push_installations')
      .where('user_id', owner.id)
      .firstOrFail()
    assert.equal(installation.notifications_enabled, false)
    assert.ok(installation.revoked_at)

    const loginResponse = await client.post('/api/companies/login').json({
      email: owner.email,
      password: 'password123',
    })
    loginResponse.assertStatus(401)
  })

  test('company accounts cannot call user booking endpoints', async ({ client }) => {
    const { owner } = await createCompany('approved')

    const response = await client
      .post('/api/users/bookings')
      .withGuard('api')
      .loginAs(owner)
      .json({})

    response.assertStatus(403)
  })

  test('banning a user revokes all of their push installations', async ({ client }) => {
    const admin = await UserFactory.apply('admin', 'verified').create()
    const user = await UserFactory.apply('user', 'verified').create()
    await db.table('push_installations').insert({
      user_id: user.id,
      installation_id: 'banned-user-device',
      expo_push_token: 'ExponentPushToken[banned-user-device]',
      platform: 'android',
      notifications_enabled: true,
      last_seen_at: DateTime.now().toSQL(),
    })

    const response = await client
      .post(`/api/admin/users/${user.id}/ban`)
      .withGuard('api')
      .loginAs(admin)
    response.assertStatus(200)

    const installation = await db.from('push_installations').where('user_id', user.id).firstOrFail()
    assert.equal(installation.notifications_enabled, false)
    assert.ok(installation.revoked_at)
  })

  test('booking ID reads and cancellation are scoped to the owning user and company', async ({
    client,
  }) => {
    const firstCompany = await createCompany('approved')
    const secondCompany = await createCompany('approved')
    const bookingOwner = await UserFactory.apply('user', 'verified').create()
    const otherUser = await UserFactory.apply('user', 'verified').create()
    const booking = await BookingFactory.apply('pending')
      .merge({ userId: bookingOwner.id, hallId: firstCompany.hall.id })
      .create()

    const userReadResponse = await client
      .get(`/api/users/bookings/${booking.id}`)
      .withGuard('api')
      .loginAs(otherUser)
    userReadResponse.assertStatus(404)

    const userCancelResponse = await client
      .post(`/api/users/bookings/${booking.id}/cancel`)
      .withGuard('api')
      .loginAs(otherUser)
    userCancelResponse.assertStatus(404)

    const companyReadResponse = await client
      .get(`/api/companies/bookings/${booking.id}`)
      .withGuard('api')
      .loginAs(secondCompany.owner)
    companyReadResponse.assertStatus(404)
  })

  test('booking creation rejects halls owned by suspended companies', async () => {
    const { hall } = await createCompany('suspended')
    const customer = await UserFactory.apply('user', 'verified').create()

    await assert.rejects(
      () =>
        bookingManagementService.createBooking(customer.id, {
          hallId: hall.id,
          bookingDate: DateTime.now().plus({ days: 3 }).startOf('day'),
          startTime: '10:00',
          endTime: '12:00',
        }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'HALL_NOT_FOUND'
    )
  })

  test('booking creation rejects inactive service IDs', async () => {
    const { company, hall } = await createCompany('approved')
    const customer = await UserFactory.apply('user', 'verified').create()
    const inactiveService = await ServiceFactory.apply('inactive')
      .merge({ companyId: company.id })
      .create()

    await assert.rejects(
      () =>
        bookingManagementService.createBooking(customer.id, {
          hallId: hall.id,
          bookingDate: DateTime.now().plus({ days: 3 }).startOf('day'),
          startTime: '10:00',
          endTime: '12:00',
          serviceIds: [inactiveService.id],
        }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'BOOKING_SERVICE_UNAVAILABLE'
    )
  })

  test('commits and delivers booking notifications through an idempotent outbox', async () => {
    const { hall, owner } = await createCompany('approved')
    const customer = await UserFactory.apply('user', 'verified').create()

    await bookingManagementService.createBooking(customer.id, {
      hallId: hall.id,
      bookingDate: DateTime.now().plus({ days: 3 }).startOf('day'),
      startTime: '10:00',
      endTime: '12:00',
    })

    const outbox = await db.from('notification_outbox').firstOrFail()
    assert.equal(outbox.processed_at, null)

    assert.equal(await notificationOutboxService.processPending(), 1)
    assert.equal(await notificationOutboxService.processPending(), 0)

    const notifications = await db
      .from('notifications')
      .where('user_id', owner.id)
      .where('outbox_id', outbox.id)
    assert.equal(notifications.length, 1)
  })

  test('booking creation returns 422 for impossible dates and times', async ({ client }) => {
    const { hall } = await createCompany('approved')
    const customer = await UserFactory.apply('user', 'verified').create()

    for (const payload of [
      { bookingDate: '2026-02-30', startTime: '10:00', endTime: '12:00' },
      { bookingDate: '2026-12-20', startTime: '25:00', endTime: '26:00' },
      { bookingDate: '2026-12-20', startTime: '10:75', endTime: '12:00' },
    ]) {
      const response = await client
        .post('/api/users/bookings')
        .withGuard('api')
        .loginAs(customer)
        .json({ hallId: hall.id, ...payload })

      response.assertStatus(422)
      response.assertBodyContains({ error: { code: 'VALIDATION_ERROR' } })
    }
  })

  test('serializes concurrent requests so only one overlapping booking is created', async () => {
    const { hall } = await createCompany('approved')
    const firstCustomer = await UserFactory.apply('user', 'verified').create()
    const secondCustomer = await UserFactory.apply('user', 'verified').create()
    const bookingDate = DateTime.now().plus({ days: 4 }).startOf('day')
    const bookingData = {
      hallId: hall.id,
      bookingDate,
      startTime: '10:00',
      endTime: '12:00',
    }

    const results = await Promise.allSettled([
      bookingManagementService.createBooking(firstCustomer.id, bookingData),
      bookingManagementService.createBooking(secondCustomer.id, bookingData),
    ])

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1)

    const storedBookings = await db
      .from('bookings')
      .where('hall_id', hall.id)
      .where('booking_date', bookingDate.toFormat('yyyy-MM-dd'))
    assert.equal(storedBookings.length, 1)
  })

  test('enforces booking ownership and records accept/reject audit events', async () => {
    const { owner, company, hall } = await createCompany('approved')
    const otherCompany = await createCompany('approved')
    const customer = await UserFactory.apply('user', 'verified').create()
    const acceptedBooking = await BookingFactory.apply('pending')
      .merge({ userId: customer.id, hallId: hall.id })
      .create()
    const rejectedBooking = await BookingFactory.apply('pending')
      .merge({ userId: customer.id, hallId: hall.id })
      .create()

    await assert.rejects(
      () =>
        bookingManagementService.acceptBooking(
          acceptedBooking.id,
          otherCompany.company.id,
          otherCompany.owner.id
        ),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'FORBIDDEN_ACTION'
    )

    await bookingManagementService.acceptBooking(acceptedBooking.id, company.id, owner.id)
    await bookingManagementService.rejectBooking(
      rejectedBooking.id,
      company.id,
      owner.id,
      'Requested date is unavailable'
    )

    const auditRows = await db
      .from('booking_audit_logs')
      .whereIn('booking_id', [acceptedBooking.id, rejectedBooking.id])
      .orderBy('id', 'asc')

    assert.deepEqual(
      auditRows.map((row) => ({
        actorUserId: row.actor_user_id,
        companyId: row.company_id,
        action: row.action,
        previousStatus: row.previous_status,
        nextStatus: row.next_status,
        reason: row.reason,
      })),
      [
        {
          actorUserId: owner.id,
          companyId: company.id,
          action: 'booking.accept',
          previousStatus: 'pending',
          nextStatus: 'accepted',
          reason: null,
        },
        {
          actorUserId: owner.id,
          companyId: company.id,
          action: 'booking.reject',
          previousStatus: 'pending',
          nextStatus: 'rejected',
          reason: 'Requested date is unavailable',
        },
      ]
    )
  })

  test('row locking prevents two terminal decisions for the same pending booking', async () => {
    const { owner, company, hall } = await createCompany('approved')
    const customer = await UserFactory.apply('user', 'verified').create()
    const booking = await BookingFactory.apply('pending')
      .merge({ userId: customer.id, hallId: hall.id })
      .create()

    const results = await Promise.allSettled([
      bookingManagementService.acceptBooking(booking.id, company.id, owner.id),
      bookingManagementService.rejectBooking(
        booking.id,
        company.id,
        owner.id,
        'Unable to fulfill this request'
      ),
    ])

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1)

    const auditRows = await db.from('booking_audit_logs').where('booking_id', booking.id)
    assert.equal(auditRows.length, 1)
  })

  test('login and registration endpoints enforce request throttles', async ({ client }) => {
    let loginResponse
    for (let attempt = 0; attempt < 6; attempt++) {
      loginResponse = await client.post('/api/users/login').json({
        email: `missing-${attempt}@example.com`,
        password: 'wrong-password',
      })
    }
    loginResponse!.assertStatus(429)

    let registrationResponse
    for (let attempt = 0; attempt < 6; attempt++) {
      registrationResponse = await client.post('/api/users/register').json({
        userName: `Rate Limit User ${attempt}`,
        email: `rate-limit-${attempt}@example.com`,
        password: 'password123',
      })
    }
    registrationResponse!.assertStatus(429)
  })
})
