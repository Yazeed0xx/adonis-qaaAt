import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import notificationOutboxService, {
  NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
} from '#services/notification_outbox_service'
import {
  createApprovedCompanyOwner,
  createCompanyMember,
  createCustomer,
} from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'
import { createPushInstallation, enqueueNotification } from '#tests/support/scenarios/notifications'

test.group('Notification outbox durability', (group) => {
  group.each.setup(withTruncateIsolation)

  test('keeps notification intent transactional and invisible after rollback', async ({
    assert,
  }) => {
    const customer = await createCustomer()
    await assert.rejects(async () => {
      await db.transaction(async (trx) => {
        await notificationOutboxService.enqueue(
          {
            userId: customer.id,
            clientContext: 'customer_app',
            type: 'booking_created',
            title: 'Rolled back',
            message: 'This intent must not commit.',
          },
          trx
        )
        throw new Error('force rollback')
      })
    }, /force rollback/)

    assert.lengthOf(await db.from('notification_outbox'), 0)
    assert.lengthOf(await db.from('notifications'), 0)
  })

  test('concurrent workers persist and fan out one business notification exactly once', async ({
    assert,
  }) => {
    const customer = await createCustomer()
    await createPushInstallation(customer, 'customer_app')
    await enqueueNotification(customer, 'customer_app', {
      type: 'booking_accepted',
      data: { bookingId: 184 },
    })

    const results = await Promise.all([
      notificationOutboxService.processPending(),
      notificationOutboxService.processPending(),
    ])

    assert.equal(
      results.reduce((total, value) => total + value, 0),
      1
    )
    assert.lengthOf(await db.from('notifications'), 1)
    assert.lengthOf(await db.from('push_deliveries'), 1)
    assert.equal(await notificationOutboxService.processPending(), 0)
  })

  test('fans out only to the intended mobile application context', async ({ assert }) => {
    const customer = await createCustomer()
    const customerInstallation = await createPushInstallation(customer, 'customer_app', {
      installationId: 'context-customer-installation-0001',
      token: 'ExponentPushToken[context-customer-installation]',
    })
    await createPushInstallation(customer, 'company_app', {
      installationId: 'context-company-installation-0001',
      token: 'ExponentPushToken[context-company-installation]',
    })
    await enqueueNotification(customer, 'customer_app')

    assert.equal(await notificationOutboxService.processPending(), 1)
    const deliveries = await db.from('push_deliveries')
    assert.lengthOf(deliveries, 1)
    assert.equal(String(deliveries[0].push_installation_id), String(customerInstallation.id))
  })

  test('fans out a company notification only when the recipient is a current member', async ({
    assert,
  }) => {
    const first = await createApprovedCompanyOwner()
    const second = await createApprovedCompanyOwner()
    const employee = await createCompanyMember(first.company, 'booking_staff')
    const installation = await createPushInstallation(employee.user, 'company_app')
    await enqueueNotification(employee.user, 'company_app', {
      companyId: first.company.id,
      title: 'Member company alert',
    })
    await enqueueNotification(employee.user, 'company_app', {
      companyId: second.company.id,
      title: 'Non-member company alert',
    })

    assert.equal(await notificationOutboxService.processPending(), 2)
    const deliveries = await db
      .from('push_deliveries as delivery')
      .join('notifications as notification', 'notification.id', 'delivery.notification_id')
      .select('delivery.push_installation_id', 'notification.title')
    assert.deepEqual(deliveries, [
      {
        push_installation_id: installation.id,
        title: 'Member company alert',
      },
    ])
  })

  test('records retry timing and dead-letters poison intent at the attempt limit', async ({
    assert,
  }) => {
    const [retryable] = await db
      .table('notification_outbox')
      .insert({
        payload: {
          userId: 999_999,
          clientContext: 'customer_app',
          type: 'booking_created',
          title: 'Poison intent',
          message: 'Invalid recipient',
        },
        available_at: DateTime.now().toSQL(),
      })
      .returning('*')

    assert.equal(await notificationOutboxService.processPending(), 0)
    const retried = await db.from('notification_outbox').where('id', retryable.id).firstOrFail()
    assert.equal(retried.attempts, 1)
    assert.isNull(retried.failed_at)
    assert.isAbove(new Date(retried.available_at).getTime(), Date.now())
    assert.include(retried.last_error, 'notifications_user_id_foreign')

    await db
      .from('notification_outbox')
      .where('id', retryable.id)
      .update({
        attempts: NOTIFICATION_OUTBOX_MAX_ATTEMPTS - 1,
        available_at: DateTime.now().minus({ minute: 1 }).toSQL(),
      })
    assert.equal(await notificationOutboxService.processPending(), 0)
    const failed = await db.from('notification_outbox').where('id', retryable.id).firstOrFail()
    assert.equal(failed.attempts, NOTIFICATION_OUTBOX_MAX_ATTEMPTS)
    assert.isNotNull(failed.failed_at)

    await db
      .from('notification_outbox')
      .where('id', retryable.id)
      .update({ available_at: DateTime.now().minus({ minute: 1 }).toSQL() })
    assert.equal(await notificationOutboxService.processPending(), 0)
    const unchanged = await db.from('notification_outbox').where('id', retryable.id).firstOrFail()
    assert.equal(unchanged.attempts, NOTIFICATION_OUTBOX_MAX_ATTEMPTS)
  })

  test('fails closed when a legacy company-app intent has no company scope', async ({ assert }) => {
    const employee = await createCustomer()
    await createPushInstallation(employee, 'company_app')
    const [outbox] = await db
      .table('notification_outbox')
      .insert({
        payload: {
          userId: employee.id,
          clientContext: 'company_app',
          type: 'new_booking_request',
          title: 'Unscoped company alert',
          message: 'This notification must never be delivered.',
        },
        available_at: DateTime.now().toSQL(),
      })
      .returning('*')

    assert.equal(await notificationOutboxService.processPending(), 0)
    assert.lengthOf(await db.from('notifications'), 0)
    assert.lengthOf(await db.from('push_deliveries'), 0)
    const failed = await db.from('notification_outbox').where('id', outbox.id).firstOrFail()
    assert.equal(failed.attempts, 1)
    assert.include(failed.last_error, 'companyId is required')
  })
})
