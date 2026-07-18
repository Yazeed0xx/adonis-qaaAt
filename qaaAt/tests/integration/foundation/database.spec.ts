import { test } from '@japa/runner'
import { createCustomer } from '#tests/support/actors'
import { assertDisposableTestDatabase, withTransactionIsolation } from '#tests/support/database'

test.group('Database test foundation', (group) => {
  group.each.setup(withTransactionIsolation)

  test('provides Lucid assertions inside rollback isolation', async ({ assert, db }) => {
    const user = await createCustomer({ email: 'foundation-transaction@example.com' })

    assert.match(assertDisposableTestDatabase(), /(?:^|[_-])test(?:$|[_-])/i)
    await db.assertHas('users', { id: user.id, email: user.email }, 1)
    await db.assertMissing('users', { email: 'missing-foundation-user@example.com' })
    await db.assertModelExists(user)
  })
})

test('rolls back transaction state through its returned cleanup function', async ({ db }) => {
  const rollback = await withTransactionIsolation()
  const email = 'foundation-explicit-rollback@example.com'

  try {
    await createCustomer({ email })
    await db.assertHas('users', { email }, 1)
  } finally {
    await rollback()
  }

  await db.assertMissing('users', { email })
})
