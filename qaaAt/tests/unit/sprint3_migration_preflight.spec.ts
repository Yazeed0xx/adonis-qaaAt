import { test } from '@japa/runner'
import { assertBtreeGistAvailable, classifyAcceptedBooking } from '#lib/sprint3_migration_preflight'

test.group('Sprint 3 migration preflight', () => {
  test('missing btree_gist fails with actionable provisioning guidance', ({ assert }) => {
    assert.throws(
      () => assertBtreeGistAvailable(false),
      /SPRINT3_BTREE_GIST_UNAVAILABLE.*provision/
    )
  })

  test('classifies future, expired, and missing accepted payment deadlines deterministically', ({
    assert,
  }) => {
    const now = new Date('2030-01-01T00:00:00Z')
    assert.equal(classifyAcceptedBooking('2030-01-02T00:00:00Z', now), 'active_hold')
    assert.equal(
      classifyAcceptedBooking('2029-12-31T23:59:59Z', now),
      'payment_expired_elapsed_deadline'
    )
    assert.equal(classifyAcceptedBooking(null, now), 'payment_expired_missing_deadline')
  })
})
