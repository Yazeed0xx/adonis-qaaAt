import { test } from '@japa/runner'
import { resolveSeedProfile } from '#database/seeding/profile'

test.group('Seeder profile', () => {
  test('uses the deterministic mobile profile by default', ({ assert }) => {
    assert.equal(resolveSeedProfile(undefined), 'mobile')
    assert.equal(resolveSeedProfile('mobile'), 'mobile')
  })

  test('rejects unknown profiles', ({ assert }) => {
    assert.throws(() => resolveSeedProfile('production'), /Unsupported SEED_PROFILE/)
    assert.throws(() => resolveSeedProfile('heavy'), /Unsupported SEED_PROFILE/)
  })
})
