import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import db from '@adonisjs/lucid/services/db'
import pushConfig from '#config/push'
import NotificationsProcess from '#commands/notifications_process'
import { createCustomer } from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'
import { enqueueNotification } from '#tests/support/scenarios/notifications'

test.group('Command notifications:process', (group) => {
  group.each.setup(withTruncateIsolation)
  group.each.setup(() => {
    ace.ui.switchMode('raw')
    const enabled = pushConfig.enabled
    pushConfig.enabled = false
    return () => {
      pushConfig.enabled = enabled
      ace.ui.switchMode('normal')
    }
  })

  test('processes committed notification intent once and reports exact counters', async ({
    assert,
  }) => {
    const customer = await createCustomer()
    await enqueueNotification(customer, 'customer_app')

    const command = await ace.create(NotificationsProcess, ['--limit=10'])
    await command.exec()

    command.assertSucceeded()
    command.assertLogMatches(/Processed notifications=1 deliveries=0 receipts=0/)
    assert.deepEqual(command.result, { notifications: 1, deliveries: 0, receipts: 0 })
    assert.lengthOf(await db.from('notifications'), 1)
    const processedIntent = await db.from('notification_outbox').firstOrFail()
    assert.isNotNull(processedIntent.processed_at)
  })

  test('rejects an unsafe batch limit with a distinct automation exit code', async () => {
    const command = await ace.create(NotificationsProcess, ['--limit=0'])
    await command.exec()

    command.assertExitCode(2)
    command.assertLogMatches(/The --limit flag must be an integer between 1 and 500/)
  })
})
