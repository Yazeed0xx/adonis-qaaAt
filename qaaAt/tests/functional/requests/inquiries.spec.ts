import { test } from '@japa/runner'
import { withTruncateIsolation } from '#tests/support/database'
import db from '@adonisjs/lucid/services/db'
import {
  createApprovedCompanyOwner,
  createCompanyMember,
  createCustomer,
} from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { responseId, responseItems, responseResource } from '#tests/support/responses'
import {
  createInquiryWorkflowScenario,
  createRequestWorkflowScenario,
  inquiryInput,
} from '#tests/support/scenarios/requests'

test.group('Date inquiry HTTP contracts', (group) => {
  group.each.setup(withTruncateIsolation)

  test('customer creates and replays a non-blocking inquiry visible only to both owners', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, customer, space, startsAt, endsAt } = await createInquiryWorkflowScenario()
    const input = inquiryInput(space.id, startsAt, endsAt, 'inquiry-create-001')
    const created = await client
      .visit('user_requests.create_inquiry')
      .withGuard('api')
      .loginAs(customer)
      .json(input)
    created.assertStatus(201)
    const inquiryId = responseId(created.body())
    const replay = await client
      .visit('user_requests.create_inquiry')
      .withGuard('api')
      .loginAs(customer)
      .json(input)
    replay.assertStatus(201)
    assert.equal(responseId(replay.body()), inquiryId)

    const customerList = await client
      .visit('user_requests.inquiries')
      .withGuard('api')
      .loginAs(customer)
    customerList.assertStatus(200)
    assert.deepEqual(
      responseItems(customerList.body()).map((item) => item.id),
      [inquiryId]
    )
    const companyShow = await client
      .visit('company_requests.show_inquiry', { id: inquiryId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
    companyShow.assertStatus(200)
    assert.notProperty(responseResource(companyShow.body()), 'customer_email_snapshot')
    const companyList = await client
      .visit('company_requests.inquiries')
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
    assert.notProperty(responseItems(companyList.body())[0], 'customer_email_snapshot')
    assert.lengthOf(await db.from('space_inventory_blocks'), 0)
    assert.lengthOf(await db.from('inquiry_events').where('inquiry_id', inquiryId), 1)
  })

  test('inquiry key reuse with a different request rolls back without a duplicate', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { customer, space, startsAt, endsAt } = await createInquiryWorkflowScenario()
    const input = inquiryInput(space.id, startsAt, endsAt, 'inquiry-reused-key')
    await client
      .visit('user_requests.create_inquiry')
      .withGuard('api')
      .loginAs(customer)
      .json(input)
    const conflict = await client
      .visit('user_requests.create_inquiry')
      .withGuard('api')
      .loginAs(customer)
      .json({ ...input, subject: 'طلب مختلف' })
    conflict.assertStatus(409)
    conflict.assertBodyContains({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } })
    assert.lengthOf(await db.from('space_inquiries'), 1)
  })

  test('customer cannot create an inquiry for a request-to-book Space', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { customer, space, startsAt, endsAt } = await createRequestWorkflowScenario()

    const response = await client
      .visit('user_requests.create_inquiry')
      .withGuard('api')
      .loginAs(customer)
      .json(inquiryInput(space.id, startsAt, endsAt, 'inquiry-wrong-mode'))

    response.assertStatus(409)
    response.assertBodyContains({ error: { code: 'SPACE_INQUIRY_MODE_MISMATCH' } })
    assert.lengthOf(await db.from('space_inquiries'), 0)
    assert.lengthOf(await db.from('request_idempotency_keys'), 0)
  })

  test('provider answer is durable, redacted, and readable after outbox delivery state is removed', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, customer, space, startsAt, endsAt } = await createInquiryWorkflowScenario()
    const created = await client
      .visit('user_requests.create_inquiry')
      .withGuard('api')
      .loginAs(customer)
      .json(inquiryInput(space.id, startsAt, endsAt, 'inquiry-answer-001'))
    const inquiryId = responseId(created.body())
    const answered = await client
      .visit('company_requests.answer_inquiry', { id: inquiryId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({ message: 'الإجابة الدائمة' })
    answered.assertStatus(200)
    answered.assertBodyContains({ data: { id: inquiryId, status: 'answered' } })
    assert.notProperty(responseResource(answered.body()), 'customer_email_snapshot')

    await db.from('notification_outbox').delete()
    const messages = await client
      .visit('user_requests.inquiry_messages', { id: inquiryId })
      .withGuard('api')
      .loginAs(customer)
    messages.assertStatus(200)
    assert.deepEqual(responseItems(messages.body()), [
      {
        id: responseItems(messages.body())[0].id,
        sender_type: 'company_member',
        body: 'الإجابة الدائمة',
        created_at: responseItems(messages.body())[0].created_at,
      },
    ])
    const event = await db
      .from('inquiry_events')
      .where('inquiry_id', inquiryId)
      .where('action', 'inquiry.answer')
      .firstOrFail()
    assert.equal(event.next_status, 'answered')
  })

  test('provider and customer transitions preserve audit and notification intent', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const { owner, company, customer, space, startsAt, endsAt } =
      await createInquiryWorkflowScenario()
    const review = await client
      .visit('user_requests.create_inquiry')
      .withGuard('api')
      .loginAs(customer)
      .json(inquiryInput(space.id, startsAt, endsAt, 'inquiry-review-001'))
    const reviewId = responseId(review.body())
    const started = await client
      .visit('company_requests.transition_inquiry', { id: reviewId, action: 'start-review' })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({ reason: 'Reviewing availability' })
    started.assertStatus(200)
    started.assertBodyContains({ data: { status: 'under_review' } })
    const rejected = await client
      .visit('company_requests.transition_inquiry', { id: reviewId, action: 'rejected' })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({ reason: 'Unavailable' })
    rejected.assertStatus(200)
    rejected.assertBodyContains({ data: { status: 'rejected' } })

    const close = await client
      .visit('user_requests.create_inquiry')
      .withGuard('api')
      .loginAs(customer)
      .json(inquiryInput(space.id, startsAt, endsAt, 'inquiry-close-001'))
    const closeId = responseId(close.body())
    await client
      .visit('company_requests.answer_inquiry', { id: closeId })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({ message: 'Answered' })
    const closed = await client
      .visit('company_requests.transition_inquiry', { id: closeId, action: 'closed' })
      .withGuard('api')
      .loginAs(owner, companyTokenAbilities(space.companyId))
      .json({ reason: 'Conversation complete' })
    closed.assertStatus(200)
    closed.assertBodyContains({ data: { status: 'closed' } })

    const cancel = await client
      .visit('user_requests.create_inquiry')
      .withGuard('api')
      .loginAs(customer)
      .json(inquiryInput(space.id, startsAt, endsAt, 'inquiry-cancel-001'))
    const cancelId = responseId(cancel.body())
    await db.from('notification_outbox').delete()
    const cancelled = await client
      .visit('user_requests.cancel_inquiry', { id: cancelId })
      .withGuard('api')
      .loginAs(customer)
    cancelled.assertStatus(200)
    cancelled.assertBodyContains({ data: { status: 'cancelled' } })
    const outbox = await db.from('notification_outbox').firstOrFail()
    assert.equal(outbox.payload.userId, company.userId)
    assert.equal(outbox.payload.type, 'date_inquiry_cancelled')
  })

  test('inquiry reads and mutations enforce customer ownership, tenant scope, and permissions', async ({
    client,
    assert,
  }) => {
    freezeTestTime()
    const first = await createInquiryWorkflowScenario()
    const viewer = await createCompanyMember(first.company, 'viewer')
    const second = await createApprovedCompanyOwner()
    const otherCustomer = await createCustomer()
    const created = await client
      .visit('user_requests.create_inquiry')
      .withGuard('api')
      .loginAs(first.customer)
      .json(inquiryInput(first.space.id, first.startsAt, first.endsAt, 'inquiry-access-001'))
    const inquiryId = responseId(created.body())

    const viewerRead = await client
      .visit('company_requests.show_inquiry', { id: inquiryId })
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
    viewerRead.assertStatus(200)
    const denied = await client
      .visit('company_requests.answer_inquiry', { id: inquiryId })
      .withGuard('api')
      .loginAs(viewer.user, companyTokenAbilities(viewer.membership.companyId))
      .json({ message: 'Forbidden answer' })
    denied.assertStatus(403)
    denied.assertBodyContains({ error: { code: 'COMPANY_PERMISSION_REQUIRED' } })
    const hiddenTenant = await client
      .visit('company_requests.show_inquiry', { id: inquiryId })
      .withGuard('api')
      .loginAs(second.user, companyTokenAbilities(second.company))
    hiddenTenant.assertStatus(404)
    const hiddenCustomer = await client
      .visit('user_requests.show_inquiry', { id: inquiryId })
      .withGuard('api')
      .loginAs(otherCustomer)
    hiddenCustomer.assertStatus(404)
    const unchanged = await db.from('space_inquiries').where('id', inquiryId).firstOrFail()
    assert.equal(unchanged.status, 'open')
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
