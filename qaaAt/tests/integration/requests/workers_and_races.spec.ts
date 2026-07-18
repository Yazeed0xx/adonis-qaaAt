import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import CompanyMembershipPermission from '#models/company_membership_permission'
import InventoryException from '#exceptions/inventory_exception'
import requestWorkflow from '#services/request_workflow_service'
import { createCompanyMember, createCustomer } from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { withTruncateIsolation } from '#tests/support/database'
import {
  bookingRequestInput,
  createInquiryWorkflowScenario,
  createRequestWorkflowScenario,
  inquiryInput,
  visitInput,
} from '#tests/support/scenarios/requests'

test.group('Request workflow workers and transition races', (group) => {
  group.each.setup(withTruncateIsolation)

  test('simultaneous identical booking submissions converge on one idempotent request', async ({
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createRequestWorkflowScenario()
    const input = bookingRequestInput(
      scenario.space.id,
      scenario.startsAt,
      scenario.endsAt,
      'concurrent-idempotency'
    )
    const attempts = await Promise.all([
      requestWorkflow.createBooking(scenario.customer.id, input),
      requestWorkflow.createBooking(scenario.customer.id, input),
    ])
    assert.equal(attempts[0].id, attempts[1].id)
    assert.lengthOf(await db.from('bookings'), 1)
    assert.lengthOf(await db.from('request_idempotency_keys'), 1)
    assert.lengthOf(await db.from('booking_audit_logs'), 1)
  })

  test('concurrent expiry workers claim each pending inquiry and visit exactly once', async ({
    assert,
  }) => {
    freezeTestTime()
    const { customer, space, startsAt, endsAt } = await createInquiryWorkflowScenario()
    const inquiry = await requestWorkflow.createInquiry(
      customer.id,
      inquiryInput(space.id, startsAt, endsAt, 'worker-inquiry')
    )
    const visit = await requestWorkflow.createVisit(
      customer.id,
      visitInput(space.id, startsAt, endsAt, 'worker-visit')
    )
    const expiredAt = DateTime.now().minus({ minute: 1 }).toSQL()
    await db
      .from('space_inquiries')
      .where('id', inquiry.id)
      .update({ response_expires_at: expiredAt })
    await db.from('visit_requests').where('id', visit.id).update({ response_expires_at: expiredAt })

    const counts = await Promise.all([
      requestWorkflow.expirePending(),
      requestWorkflow.expirePending(),
    ])
    assert.equal(
      counts.reduce((total, count) => total + count, 0),
      2
    )
    const expiredInquiry = await db.from('space_inquiries').where('id', inquiry.id).firstOrFail()
    const expiredVisit = await db.from('visit_requests').where('id', visit.id).firstOrFail()
    assert.equal(expiredInquiry.status, 'expired')
    assert.equal(expiredVisit.status, 'expired')
    assert.lengthOf(
      await db.from('inquiry_events').where({ inquiry_id: inquiry.id, action: 'inquiry.expire' }),
      1
    )
    assert.lengthOf(
      await db.from('visit_events').where({ visit_id: visit.id, action: 'visit.expire' }),
      1
    )
    assert.lengthOf(
      await db
        .from('notification_outbox')
        .whereIn(db.raw("payload->>'type'"), ['date_inquiry_expired', 'visit_expired']),
      2
    )
  })

  test('expiry limit is global and confirmed visits survive their response deadline', async ({
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createInquiryWorkflowScenario()
    const secondCustomer = await createCustomer()
    const inquiry = await requestWorkflow.createInquiry(
      scenario.customer.id,
      inquiryInput(scenario.space.id, scenario.startsAt, scenario.endsAt, 'bounded-inquiry')
    )
    const visit = await requestWorkflow.createVisit(
      secondCustomer.id,
      visitInput(scenario.space.id, scenario.startsAt, scenario.endsAt, 'confirmed-visit')
    )
    await requestWorkflow.transitionVisit(
      scenario.company.id,
      visit.id,
      scenario.owner.id,
      'confirmed'
    )
    const expiredAt = DateTime.now().minus({ minute: 1 }).toSQL()
    await db
      .from('space_inquiries')
      .where('id', inquiry.id)
      .update({ response_expires_at: expiredAt })
    await db.from('visit_requests').where('id', visit.id).update({ response_expires_at: expiredAt })

    assert.equal(await requestWorkflow.expirePending(1), 1)
    assert.equal(await requestWorkflow.expirePending(1), 0)
    const confirmed = await db.from('visit_requests').where('id', visit.id).firstOrFail()
    assert.equal(confirmed.status, 'confirmed')
  })

  test('inquiry notification fanout honors permission overrides and membership status', async ({
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createInquiryWorkflowScenario()
    const employee = await createCompanyMember(scenario.company, 'booking_staff')
    const revoked = await createCompanyMember(scenario.company, 'booking_staff')
    revoked.membership.status = 'revoked'
    await revoked.membership.save()
    const denied = await createCompanyMember(scenario.company, 'viewer')
    await CompanyMembershipPermission.create({
      companyMembershipId: denied.membership.id,
      permission: 'inquiries.view',
      effect: 'deny',
    })
    await db.from('notification_outbox').delete()

    await requestWorkflow.createInquiry(
      scenario.customer.id,
      inquiryInput(scenario.space.id, scenario.startsAt, scenario.endsAt, 'fanout-inquiry')
    )
    const outbox = await db.from('notification_outbox')
    const recipients = outbox.map((row) => row.payload.userId)
    assert.sameMembers(recipients, [scenario.owner.id, employee.user.id])
    assert.notInclude(recipients, revoked.user.id)
    assert.notInclude(recipients, denied.user.id)
  })

  test('customer acceptance and provider cancellation of one alternative permit one winner', async ({
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createRequestWorkflowScenario()
    const visit = await requestWorkflow.createVisit(
      scenario.customer.id,
      visitInput(scenario.space.id, scenario.startsAt, scenario.endsAt, 'visit-transition-race')
    )
    const proposed = await requestWorkflow.transitionVisit(
      scenario.company.id,
      visit.id,
      scenario.owner.id,
      'confirmed',
      {
        startsAt: scenario.day.set({ hour: 14 }).toISO(),
        endsAt: scenario.day.set({ hour: 15 }).toISO(),
      }
    )

    const attempts = await Promise.allSettled([
      requestWorkflow.acceptVisitAlternative(scenario.customer.id, visit.id),
      requestWorkflow.transitionVisit(
        scenario.company.id,
        visit.id,
        scenario.owner.id,
        'cancelled',
        { reason: 'Provider cancelled', lockVersion: proposed.lock_version }
      ),
    ])
    assert.lengthOf(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
      1
    )
    const failures = attempts.filter((attempt) => attempt.status === 'rejected')
    assert.lengthOf(failures, 1)
    assert.instanceOf(failures[0].reason, InventoryException)
    const finalVisit = await db.from('visit_requests').where('id', visit.id).firstOrFail()
    assert.include(['confirmed', 'cancelled'], finalVisit.status)
    const terminalEvents = await db
      .from('visit_events')
      .where('visit_id', visit.id)
      .whereIn('action', ['visit.alternative_accepted', 'visit.cancelled'])
    assert.lengthOf(terminalEvents, 1)
  })

  test('simultaneous confirmation of overlapping venue visits permits one appointment', async ({
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createRequestWorkflowScenario()
    const secondCustomer = await createCustomer()
    const first = await requestWorkflow.createVisit(
      scenario.customer.id,
      visitInput(scenario.space.id, scenario.startsAt, scenario.endsAt, 'visit-overlap-first')
    )
    const second = await requestWorkflow.createVisit(
      secondCustomer.id,
      visitInput(scenario.space.id, scenario.startsAt, scenario.endsAt, 'visit-overlap-second')
    )

    const attempts = await Promise.allSettled([
      requestWorkflow.transitionVisit(
        scenario.company.id,
        first.id,
        scenario.owner.id,
        'confirmed'
      ),
      requestWorkflow.transitionVisit(
        scenario.company.id,
        second.id,
        scenario.owner.id,
        'confirmed'
      ),
    ])
    assert.lengthOf(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
      1
    )
    const failures = attempts.filter((attempt) => attempt.status === 'rejected')
    assert.lengthOf(failures, 1)
    assert.instanceOf(failures[0].reason, InventoryException)
    assert.equal(failures[0].reason.code, 'VISIT_TIME_CONFLICT')
    const visits = await db.from('visit_requests').orderBy('id')
    assert.sameMembers(
      visits.map((visit) => visit.status),
      ['confirmed', 'submitted']
    )
  })
})
