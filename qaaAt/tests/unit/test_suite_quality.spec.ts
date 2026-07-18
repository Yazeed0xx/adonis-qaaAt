import { test } from '@japa/runner'
import { findTestSuiteViolations } from '../../scripts/check_test_suite_quality.mjs'

const root = '/workspace/tests'

test.group('Test-suite quality gate', () => {
  test('accepts canonical feature tests using the guarded database boundary', ({ assert }) => {
    const violations = findTestSuiteViolations([
      {
        path: `${root}/functional/bookings/access.spec.ts`,
        source: [
          "import { test } from '@japa/runner'",
          "import { withTruncateIsolation } from '#tests/support/database'",
          "test.group('Bookings access', (group) => group.each.setup(withTruncateIsolation))",
        ].join('\n'),
      },
    ])

    assert.deepEqual(violations, [])
  })

  test('reports disabled tests, migration coupling, any, and database boundary bypasses', ({
    assert,
  }) => {
    const disabled = `test.${'skip'}('hidden contract', () => {})`
    const unsafeType = `const row = value as ${'any'}`
    const migrationImport = `import Migration from '#database/${'migrations'}/create_users'`
    const testUtilsImport = `import testUtils from '@adonisjs/core/services/${'test_utils'}'`
    const violations = findTestSuiteViolations([
      {
        path: `${root}/functional/legacy.spec.ts`,
        source: [disabled, unsafeType, migrationImport, testUtilsImport].join('\n'),
      },
    ])

    assert.sameMembers(
      violations.map(({ rule }) => rule),
      [
        'focused-or-disabled-test',
        'migration-internals',
        'explicit-any',
        'root-functional-monolith',
        'database-boundary-bypass',
      ]
    )
  })
})
