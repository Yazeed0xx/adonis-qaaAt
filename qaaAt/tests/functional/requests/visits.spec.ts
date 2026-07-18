import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import {
  createApprovedCompanyOwner,
  createCompanyMember,
  createCustomer,
} from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { responseId, responseItems, responseResource } from '#tests/support/responses'
import { createRequestWorkflowScenario, visitInput } from '#tests/support/scenarios/requests'

test.group('Visit request HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('customer submission is idempotent, tenant-readable, redacted, and non-blocking', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, customer, space, startsAt, endsAt } = await createRequestWorkflowScenario()
    const input = visitInput(space.id, startsAt, endsAt, 'visit-create-001')
    const created = await client
      .visit('user_requests.create_visit')
      .withGuard('api')
      .loginAs(customer)
      .json(input)
    created.assertStatus(201)
    const visitId = responseId(created.body())
    const replay = await client
      .visit('user_requests.create_visit')
      .withGuard('api')
      .loginAs(customer)
      .json(input)
    replay.assertStatus(201)
    assert.equal(responseId(replay.body()), visitId)

    const customerList = await client
      .visit('user_requests.visits')
      .withGuard('api')
      .loginAs(customer)
    assert.deepEqual(
      responseItems(customerList.body()).map((item) => item.id),
      [visitId]
    )
    const companyShow = await client
      .visit('company_requests.show_visit', { id: visitId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
    companyShow.assertStatus(200)
    assert.notProperty(responseResource(companyShow.body()), 'customer_email_snapshot')
    const companyList = await client
      .visit('company_requests.visits')
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
    assert.notProperty(responseItems(companyList.body())[0], 'customer_email_snapshot')
    assert.lengthOf(await db.from('space_inventory_blocks'), 0)
    assert.lengthOf(await db.from('visit_events').where('visit_id', visitId), 1)
  })

  test('provider confirms and completes a visit without reserving rentable inventory', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, customer, space, startsAt, endsAt } = await createRequestWorkflowScenario()
    const created = await client
      .visit('user_requests.create_visit')
      .withGuard('api')
      .loginAs(customer)
      .json(visitInput(space.id, startsAt, endsAt, 'visit-confirm-001'))
    const visitId = responseId(created.body())
    const confirmed = await client
      .visit('company_requests.visit_action', { id: visitId, action: 'confirm' })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({})
    confirmed.assertStatus(200)
    confirmed.assertBodyContains({ data: { status: 'confirmed' } })
    assert.notProperty(responseResource(confirmed.body()), 'customer_email_snapshot')
    const completed = await client
      .visit('company_requests.visit_action', { id: visitId, action: 'complete' })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({ reason: 'Visit completed' })
    completed.assertStatus(200)
    completed.assertBodyContains({ data: { status: 'completed' } })
    assert.lengthOf(await db.from('space_inventory_blocks'), 0)
    const events = await db.from('visit_events').where('visit_id', visitId).orderBy('id')
    assert.deepEqual(
      events.map((event) => event.action),
      ['visit.submit', 'visit.confirmed', 'visit.completed']
    )
  })

  test('provider-proposed alternative requires explicit customer acceptance or rejection', async ({
    client,
  }) => {
    freezeTestTime()
    const { owner, customer, space, day, startsAt, endsAt } = await createRequestWorkflowScenario()
    const created = await client
      .visit('user_requests.create_visit')
      .withGuard('api')
      .loginAs(customer)
      .json(visitInput(space.id, startsAt, endsAt, 'visit-alternative-accept'))
    const visitId = responseId(created.body())
    const proposed = await client
      .visit('company_requests.visit_action', { id: visitId, action: 'confirm' })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({
        startsAt: day.set({ hour: 13 }).toISO(),
        endsAt: day.set({ hour: 14 }).toISO(),
      })
    proposed.assertStatus(200)
    proposed.assertBodyContains({ data: { status: 'alternative_proposed' } })
    const accepted = await client
      .visit('user_requests.accept_visit_alternative', { id: visitId })
      .withGuard('api')
      .loginAs(customer)
    accepted.assertStatus(200)
    accepted.assertBodyContains({ data: { status: 'confirmed' } })

    const second = await client
      .visit('user_requests.create_visit')
      .withGuard('api')
      .loginAs(customer)
      .json(
        visitInput(
          space.id,
          day.set({ hour: 16 }).toISO()!,
          day.set({ hour: 17 }).toISO()!,
          'visit-alternative-reject'
        )
      )
    const secondId = responseId(second.body())
    await client
      .visit('company_requests.visit_action', { id: secondId, action: 'confirm' })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({
        startsAt: day.set({ hour: 18 }).toISO(),
        endsAt: day.set({ hour: 19 }).toISO(),
      })
    const rejected = await client
      .visit('user_requests.reject_visit_alternative', { id: secondId })
      .withGuard('api')
      .loginAs(customer)
    rejected.assertStatus(200)
    rejected.assertBodyContains({ data: { status: 'cancelled' } })
  })

  test('invalid or elapsed alternatives fail without state, event, or outbox changes', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, customer, space, day, startsAt, endsAt } = await createRequestWorkflowScenario()
    const created = await client
      .visit('user_requests.create_visit')
      .withGuard('api')
      .loginAs(customer)
      .json(visitInput(space.id, startsAt, endsAt, 'visit-invalid-alternative'))
    const visitId = responseId(created.body())
    const before = await db.from('visit_requests').where('id', visitId).firstOrFail()
    const eventsBefore = await db.from('visit_events').where('visit_id', visitId)
    const outboxBefore = await db.from('notification_outbox')
    const reversed = await client
      .visit('company_requests.visit_action', { id: visitId, action: 'confirm' })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({
        startsAt: day.set({ hour: 15 }).toISO(),
        endsAt: day.set({ hour: 14 }).toISO(),
      })
    reversed.assertStatus(422)
    reversed.assertBodyContains({ error: { code: 'REQUEST_TIME_INVALID' } })
    const after = await db.from('visit_requests').where('id', visitId).firstOrFail()
    assert.equal(after.status, before.status)
    assert.equal(after.lock_version, before.lock_version)
    assert.lengthOf(await db.from('visit_events').where('visit_id', visitId), eventsBefore.length)
    assert.lengthOf(await db.from('notification_outbox'), outboxBefore.length)

    const past = await client
      .visit('company_requests.visit_action', { id: visitId, action: 'confirm' })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({
        startsAt: DateTime.now().minus({ hours: 2 }).toISO(),
        endsAt: DateTime.now().minus({ hour: 1 }).toISO(),
      })
    past.assertStatus(422)
    past.assertBodyContains({ error: { code: 'REQUEST_TIME_INVALID' } })

    await db
      .from('visit_requests')
      .where('id', visitId)
      .update({
        starts_at: DateTime.now().minus({ hours: 2 }).toSQL(),
        ends_at: DateTime.now().minus({ hour: 1 }).toSQL(),
      })
    const elapsedOriginal = await client
      .visit('company_requests.visit_action', { id: visitId, action: 'confirm' })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({})
    elapsedOriginal.assertStatus(422)
    elapsedOriginal.assertBodyContains({ error: { code: 'REQUEST_TIME_INVALID' } })
  })

  test('elapsed proposed appointment cannot be accepted and leaves history unchanged', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, customer, space, day, startsAt, endsAt } = await createRequestWorkflowScenario()
    const created = await client
      .visit('user_requests.create_visit')
      .withGuard('api')
      .loginAs(customer)
      .json(visitInput(space.id, startsAt, endsAt, 'visit-elapsed-alternative'))
    const visitId = responseId(created.body())
    await client
      .visit('company_requests.visit_action', { id: visitId, action: 'confirm' })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({
        startsAt: day.set({ hour: 15 }).toISO(),
        endsAt: day.set({ hour: 16 }).toISO(),
      })
    await db
      .from('visit_requests')
      .where('id', visitId)
      .update({
        proposed_starts_at: DateTime.now().minus({ hours: 2 }).toSQL(),
        proposed_ends_at: DateTime.now().minus({ hour: 1 }).toSQL(),
      })
    const before = await db.from('visit_requests').where('id', visitId).firstOrFail()
    const events = await db.from('visit_events').where('visit_id', visitId)
    const response = await client
      .visit('user_requests.accept_visit_alternative', { id: visitId })
      .withGuard('api')
      .loginAs(customer)
    response.assertStatus(422)
    response.assertBodyContains({ error: { code: 'REQUEST_TIME_INVALID' } })
    const after = await db.from('visit_requests').where('id', visitId).firstOrFail()
    assert.equal(after.status, 'alternative_proposed')
    assert.equal(after.lock_version, before.lock_version)
    assert.lengthOf(await db.from('visit_events').where('visit_id', visitId), events.length)
  })

  test('visit reads and mutations enforce customer ownership, tenant scope, and permissions', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const first = await createRequestWorkflowScenario()
    const viewer = await createCompanyMember(first.company, 'viewer')
    const second = await createApprovedCompanyOwner()
    const otherCustomer = await createCustomer()
    const created = await client
      .visit('user_requests.create_visit')
      .withGuard('api')
      .loginAs(first.customer)
      .json(visitInput(first.space.id, first.startsAt, first.endsAt, 'visit-access-001'))
    const visitId = responseId(created.body())

    const viewerRead = await client
      .visit('company_requests.show_visit', { id: visitId })
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
    viewerRead.assertStatus(200)
    const denied = await client
      .visit('company_requests.visit_action', { id: visitId, action: 'confirm' })
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
      .json({})
    denied.assertStatus(403)
    denied.assertBodyContains({ error: { code: 'COMPANY_PERMISSION_REQUIRED' } })
    const hiddenTenant = await client
      .visit('company_requests.show_visit', { id: visitId })
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
    hiddenTenant.assertStatus(404)
    const hiddenCustomer = await client
      .visit('user_requests.show_visit', { id: visitId })
      .withGuard('api')
      .loginAs(otherCustomer)
    hiddenCustomer.assertStatus(404)
    const unchanged = await db.from('visit_requests').where('id', visitId).firstOrFail()
    assert.equal(unchanged.status, 'submitted')
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
