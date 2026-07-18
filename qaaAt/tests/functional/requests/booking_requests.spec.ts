import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import {
  createApprovedCompanyOwner,
  createCompanyMember,
  createCustomer,
} from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { responseId, responseItems } from '#tests/support/responses'
import {
  bookingRequestInput,
  createRequestWorkflowScenario,
} from '#tests/support/scenarios/requests'

test.group('Booking request HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('customer submission is idempotent, readable, audited, and non-blocking', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { customer, space, startsAt, endsAt } = await createRequestWorkflowScenario()
    const input = bookingRequestInput(space.id, startsAt, endsAt, 'booking-create-001')
    const first = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(customer)
      .json(input)
    first.assertStatus(201)
    const bookingId = responseId(first.body())
    const replay = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(customer)
      .json(input)
    replay.assertStatus(201)
    assert.equal(responseId(replay.body()), bookingId)

    const shown = await client
      .visit('user_requests.show_booking', { id: bookingId })
      .withGuard('api')
      .loginAs(customer)
    shown.assertStatus(200)
    shown.assertBodyContains({
      data: {
        id: bookingId,
        status: 'pending',
        spaceId: space.id,
        spaceNameSnapshot: { ar: null, en: 'Request workflow space' },
        venueNameSnapshot: { ar: 'مركز الرياض', en: 'Riyadh Center' },
      },
    })
    const listed = await client.visit('user_requests.bookings').withGuard('api').loginAs(customer)
    listed.assertStatus(200)
    assert.deepEqual(
      responseItems(listed.body()).map((item) => item.id),
      [bookingId]
    )

    const booking = await db.from('bookings').where('id', bookingId).firstOrFail()
    assert.equal(booking.space_id, space.id)
    assert.equal(booking.status, 'pending')
    assert.lengthOf(await db.from('space_inventory_blocks'), 0)
    assert.lengthOf(await db.from('booking_audit_logs').where('booking_id', bookingId), 1)
    assert.lengthOf(await db.from('request_idempotency_keys').where('resource_id', bookingId), 1)
  })

  test('reusing a booking idempotency key with another payload creates no duplicate', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { customer, space, startsAt, endsAt } = await createRequestWorkflowScenario()
    const input = bookingRequestInput(space.id, startsAt, endsAt, 'booking-reused-key')
    await client.visit('user_requests.store_booking').withGuard('api').loginAs(customer).json(input)
    const reused = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(customer)
      .json({ ...input, attendance: 101 })
    reused.assertStatus(409)
    reused.assertBodyContains({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } })
    assert.lengthOf(await db.from('bookings'), 1)
    assert.lengthOf(await db.from('request_idempotency_keys'), 1)
  })

  test('provider approval revalidates availability and atomically creates one payment hold', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, customer, space, startsAt, endsAt } = await createRequestWorkflowScenario()
    const created = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(customer)
      .json(bookingRequestInput(space.id, startsAt, endsAt, 'booking-approve-001'))
    const bookingId = responseId(created.body())
    const approved = await client
      .visit('company_requests.approve_booking', { id: bookingId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
    approved.assertStatus(200)

    const booking = await db.from('bookings').where('id', bookingId).firstOrFail()
    const holds = await db.from('booking_holds').where('booking_id', bookingId)
    const blocks = await db.from('space_inventory_blocks').where('booking_hold_id', holds[0].id)
    assert.equal(booking.status, 'accepted')
    assert.lengthOf(holds, 1)
    assert.equal(holds[0].status, 'active')
    assert.lengthOf(blocks, 1)
    assert.equal(blocks[0].status, 'active')
  })

  test('provider rejection and customer or provider cancellation preserve terminal history', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createRequestWorkflowScenario()
    const rejectedRequest = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(scenario.customer)
      .json(
        bookingRequestInput(
          scenario.space.id,
          scenario.startsAt,
          scenario.endsAt,
          'booking-reject-001'
        )
      )
    const rejectedId = responseId(rejectedRequest.body())
    const rejected = await client
      .visit('company_requests.reject_booking', { id: rejectedId })
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
      .json({ reason: 'Unavailable date' })
    rejected.assertStatus(200)
    rejected.assertBodyContains({ data: { status: 'rejected' } })

    const cancelledRequest = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(scenario.customer)
      .json(
        bookingRequestInput(
          scenario.space.id,
          scenario.startsAt,
          scenario.endsAt,
          'booking-customer-cancel'
        )
      )
    const cancelledId = responseId(cancelledRequest.body())
    const cancelled = await client
      .visit('user_requests.cancel_booking', { id: cancelledId })
      .withGuard('api')
      .loginAs(scenario.customer)
    cancelled.assertStatus(200)
    cancelled.assertBodyContains({ data: { status: 'cancelled' } })

    const providerCancellationRequest = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(scenario.customer)
      .json(
        bookingRequestInput(
          scenario.space.id,
          scenario.startsAt,
          scenario.endsAt,
          'booking-provider-cancel'
        )
      )
    const providerCancellationId = responseId(providerCancellationRequest.body())
    await client
      .visit('company_requests.approve_booking', { id: providerCancellationId })
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
    const providerCancelled = await client
      .visit('company_requests.cancel_booking', { id: providerCancellationId })
      .withGuard('api')
      .loginAs(scenario.owner, companyTokenAbilities(scenario.company))
      .json({ reason: 'Provider cancellation' })
    providerCancelled.assertStatus(200)
    providerCancelled.assertBodyContains({ data: { status: 'cancelled' } })
    const hold = await db
      .from('booking_holds')
      .where('booking_id', providerCancellationId)
      .firstOrFail()
    const block = await db
      .from('space_inventory_blocks')
      .where('booking_hold_id', hold.id)
      .firstOrFail()
    assert.equal(hold.status, 'cancelled')
    assert.equal(block.status, 'released')
    assert.lengthOf(
      await db
        .from('booking_audit_logs')
        .whereIn('booking_id', [rejectedId, cancelledId, providerCancellationId]),
      7
    )
  })

  test('policy closure or Space suspension before approval leaves the request pending', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, company, customer, space, day, startsAt, endsAt } =
      await createRequestWorkflowScenario()
    const first = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(customer)
      .json(bookingRequestInput(space.id, startsAt, endsAt, 'booking-policy-change'))
    const firstId = responseId(first.body())
    await db.table('availability_exceptions').insert({
      company_id: company.id,
      space_id: space.id,
      local_date: day.toFormat('yyyy-MM-dd'),
      kind: 'closed',
      ends_next_day: false,
      created_by_user_id: owner.id,
    })
    const closed = await client
      .visit('company_requests.approve_booking', { id: firstId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
    closed.assertStatus(409)
    closed.assertBodyContains({ error: { code: 'AVAILABILITY_SCHEDULE_CONFLICT' } })

    await db.from('availability_exceptions').delete()
    const secondCustomer = await createCustomer()
    const second = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(secondCustomer)
      .json(bookingRequestInput(space.id, startsAt, endsAt, 'booking-suspended-space'))
    const secondId = responseId(second.body())
    await db.from('spaces').where('id', space.id).update({ publication_status: 'suspended' })
    const suspended = await client
      .visit('company_requests.approve_booking', { id: secondId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
    suspended.assertStatus(409)
    suspended.assertBodyContains({ error: { code: 'SPACE_NOT_APPROVABLE' } })

    const rows = await db.from('bookings').whereIn('id', [firstId, secondId])
    assert.deepEqual(
      rows.map((row) => row.status),
      ['pending', 'pending']
    )
    assert.lengthOf(await db.from('booking_holds'), 0)
  })

  test('booking inbox is tenant-scoped and viewers cannot decide requests', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const first = await createRequestWorkflowScenario()
    const viewer = await createCompanyMember(first.company, 'viewer')
    const second = await createApprovedCompanyOwner()
    const otherCustomer = await createCustomer()
    const created = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(first.customer)
      .json(bookingRequestInput(first.space.id, first.startsAt, first.endsAt, 'booking-access-001'))
    const bookingId = responseId(created.body())

    const viewerRead = await client
      .visit('company_requests.show_booking', { id: bookingId })
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
    viewerRead.assertStatus(200)
    const denied = await client
      .visit('company_requests.approve_booking', { id: bookingId })
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
    denied.assertStatus(403)
    denied.assertBodyContains({ error: { code: 'COMPANY_PERMISSION_REQUIRED' } })
    const hiddenCompany = await client
      .visit('company_requests.show_booking', { id: bookingId })
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
    hiddenCompany.assertStatus(404)
    const hiddenCustomer = await client
      .visit('user_requests.show_booking', { id: bookingId })
      .withGuard('api')
      .loginAs(otherCustomer)
    hiddenCustomer.assertStatus(404)
    const unchanged = await db.from('bookings').where('id', bookingId).firstOrFail()
    assert.equal(unchanged.status, 'pending')
  })

  test('simultaneous provider approvals create one winner and one durable hold', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createRequestWorkflowScenario()
    const secondCustomer = await createCustomer()
    const first = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(scenario.customer)
      .json(
        bookingRequestInput(scenario.space.id, scenario.startsAt, scenario.endsAt, 'booking-race-1')
      )
    const second = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(secondCustomer)
      .json(
        bookingRequestInput(scenario.space.id, scenario.startsAt, scenario.endsAt, 'booking-race-2')
      )

    const responses = await Promise.all([
      client
        .visit('company_requests.approve_booking', { id: responseId(first.body()) })
        .withGuard('api')
        .loginAs(scenario.owner, companyTokenAbilities(scenario.company)),
      client
        .visit('company_requests.approve_booking', { id: responseId(second.body()) })
        .withGuard('api')
        .loginAs(scenario.owner, companyTokenAbilities(scenario.company)),
    ])
    assert.deepEqual(responses.map((response) => response.status()).sort(), [200, 409])
    responses
      .find((response) => response.status() === 409)!
      .assertBodyContains({
        error: { code: 'INVENTORY_OVERLAP' },
      })
    assert.lengthOf(await db.from('booking_holds').where('status', 'active'), 1)
    assert.lengthOf(await db.from('space_inventory_blocks').where('status', 'active'), 1)
    assert.lengthOf(await db.from('bookings').where('status', 'pending'), 1)
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
