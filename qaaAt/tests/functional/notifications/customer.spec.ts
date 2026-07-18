import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { createCustomer } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'
import { createNotification } from '#tests/support/scenarios/notifications'

test.group('Customer notifications HTTP contract', (group) => {
  group.each.setup(withTruncateIsolation)

  test('lists only the authenticated customer notifications with filters and pagination', async ({
    client,
    assert,
  }) => {
    const customer = await createCustomer({ email: 'notifications.customer@example.com' })
    const other = await createCustomer({ email: 'notifications.other@example.com' })
    await createNotification(customer, {
      title: 'Read notification',
      readAt: DateTime.now().minus({ minute: 1 }),
    })
    const unread = await createNotification(customer, { title: 'Unread notification' })
    await createNotification(other, { title: 'Private other-user notification' })

    const response = await client
      .visit('users.notification.index')
      .withGuard('api')
      .loginAs(customer)
      .qs({ unread_only: true, page: 1, limit: 1 })

    response.assertStatus(200)
    response.assertBodyContains({
      data: [{ id: String(unread.id), title: 'Unread notification', isRead: false }],
      metadata: { total: 1, perPage: 1, currentPage: 1 },
    })
    const body = JSON.stringify(response.body())
    assert.notInclude(body, 'Private other-user notification')
    assert.notInclude(body, 'Read notification')
    assert.notInclude(body, 'outboxId')
  })

  test('reports unread count and marks only owned notifications as read', async ({
    client,
    assert,
  }) => {
    const customer = await createCustomer({ email: 'notification.owner@example.com' })
    const other = await createCustomer({ email: 'notification.intruder@example.com' })
    const owned = await createNotification(customer)
    const foreign = await createNotification(other)

    const count = await client
      .visit('users.notification.unreadCount')
      .withGuard('api')
      .loginAs(customer)
    count.assertStatus(200)
    count.assertBodyContains({ data: { unreadCount: 1 } })

    const hidden = await client
      .visit('users.notification.markAsRead', { id: foreign.id })
      .withGuard('api')
      .loginAs(customer)
    hidden.assertStatus(404)

    const marked = await client
      .visit('users.notification.markAsRead', { id: owned.id })
      .withGuard('api')
      .loginAs(customer)
    marked.assertStatus(200)
    marked.assertBodyContains({ data: { id: String(owned.id), isRead: true } })
    assert.isNull(foreign.read_at)
  })

  test('marks all unread notifications for the customer without touching another account', async ({
    client,
    assert,
  }) => {
    const customer = await createCustomer({ email: 'read-all.customer@example.com' })
    const other = await createCustomer({ email: 'read-all.other@example.com' })
    await createNotification(customer)
    await createNotification(customer)
    const foreign = await createNotification(other)

    const response = await client
      .visit('users.notification.markAllAsRead')
      .withGuard('api')
      .loginAs(customer)

    response.assertStatus(200)
    response.assertBodyContains({ data: { markedCount: 2 } })
    assert.isNull(foreign.read_at)
  })

  test('requires the customer authentication context', async ({ client }) => {
    const anonymous = await client.visit('users.notification.index')
    anonymous.assertStatus(401)
  })
})
