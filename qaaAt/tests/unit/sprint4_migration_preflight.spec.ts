import { test } from '@japa/runner'
import { assertSprint4RollbackSafe } from '#lib/sprint4_migration_preflight'

test.group('Sprint 4 migration preflight', () => {
  test('allows rollback before Space-only usage', ({ assert }) => {
    assert.doesNotThrow(() => assertSprint4RollbackSafe(0))
  })

  test('fails rollback with an actionable Space-only Booking report', ({ assert }) => {
    assert.throws(
      () => assertSprint4RollbackSafe(3),
      'Sprint 4 rollback blocked: 3 Space-only Booking rows require Sprint 4 schema'
    )
  })
})
