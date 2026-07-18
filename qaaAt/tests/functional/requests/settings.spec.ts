import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import { createApprovedCompanyOwner, createCompanyMember } from '#tests/support/actors'
import { freezeTestTime, TEST_NOW } from '#tests/support/clock'
import { responseId } from '#tests/support/responses'
import {
  bookingRequestInput,
  createInquiryWorkflowScenario,
  createRequestWorkflowScenario,
  inquiryInput,
  visitInput,
} from '#tests/support/scenarios/requests'

test.group('Request response settings HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('Space overrides set exact booking, inquiry, visit, and quote response horizons', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const bookingScenario = await createRequestWorkflowScenario()
    const inquiryScenario = await createInquiryWorkflowScenario()
    const { owner, customer, space, startsAt, endsAt } = bookingScenario
    const updated = await client
      .visit('company_requests.update_settings', { spaceId: space.id })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({
        bookingResponseHours: 2,
        visitResponseHours: 4,
      })
    updated.assertStatus(200)
    updated.assertBodyContains({
      data: {
        booking_response_hours: 2,
        visit_response_hours: 4,
      },
    })

    const inquirySettings = await client
      .visit('company_requests.update_settings', { spaceId: inquiryScenario.space.id })
      .withGuard('api')
      .loginAs(inquiryScenario.owner, companyTokenAbilities(inquiryScenario.space.companyId))
      .json({ inquiryResponseHours: 3, quoteHoldHours: 5 })
    inquirySettings.assertStatus(200)
    inquirySettings.assertBodyContains({
      data: {
        inquiry_response_hours: 3,
        quote_hold_hours: 5,
      },
    })

    const booking = await client
      .visit('user_requests.store_booking')
      .withGuard('api')
      .loginAs(customer)
      .json(bookingRequestInput(space.id, startsAt, endsAt, 'settings-booking'))
    const inquiry = await client
      .visit('user_requests.create_inquiry')
      .withGuard('api')
      .loginAs(inquiryScenario.customer)
      .json(
        inquiryInput(
          inquiryScenario.space.id,
          inquiryScenario.startsAt,
          inquiryScenario.endsAt,
          'settings-inquiry'
        )
      )
    const visit = await client
      .visit('user_requests.create_visit')
      .withGuard('api')
      .loginAs(customer)
      .json(visitInput(space.id, startsAt, endsAt, 'settings-visit'))

    const bookingRow = await db
      .from('bookings')
      .where('id', responseId(booking.body()))
      .firstOrFail()
    const inquiryRow = await db
      .from('space_inquiries')
      .where('id', responseId(inquiry.body()))
      .firstOrFail()
    const visitRow = await db
      .from('visit_requests')
      .where('id', responseId(visit.body()))
      .firstOrFail()
    assert.equal(
      new Date(bookingRow.response_expires_at).toISOString(),
      new Date(TEST_NOW.getTime() + 2 * 60 * 60 * 1000).toISOString()
    )
    assert.equal(
      new Date(inquiryRow.response_expires_at).toISOString(),
      new Date(TEST_NOW.getTime() + 3 * 60 * 60 * 1000).toISOString()
    )
    assert.equal(
      new Date(visitRow.response_expires_at).toISOString(),
      new Date(TEST_NOW.getTime() + 4 * 60 * 60 * 1000).toISOString()
    )
  })

  test('settings are tenant-hidden and read-only without booking-request management', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const first = await createRequestWorkflowScenario()
    const viewer = await createCompanyMember(first.company, 'viewer')
    const second = await createApprovedCompanyOwner()
    const readable = await client
      .visit('company_requests.show_settings', { spaceId: first.space.id })
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
    readable.assertStatus(200)

    const denied = await client
      .visit('company_requests.update_settings', { spaceId: first.space.id })
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
      .json({ bookingResponseHours: 1 })
    denied.assertStatus(403)
    denied.assertBodyContains({ error: { code: 'COMPANY_PERMISSION_REQUIRED' } })
    const hidden = await client
      .visit('company_requests.show_settings', { spaceId: first.space.id })
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
    hidden.assertStatus(404)
    assert.lengthOf(await db.from('space_request_settings'), 0)
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
