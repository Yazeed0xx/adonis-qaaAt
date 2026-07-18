import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import env from '#start/env'

type TestCleanup = () => Promise<void>

export function assertDisposableTestDatabase() {
  const database = env.get('DB_DATABASE')

  if (!app.inTest || env.get('NODE_ENV') !== 'test') {
    throw new Error('Database test utilities may run only in the AdonisJS test environment')
  }

  if (!/(?:^|[_-])test(?:$|[_-])/i.test(database)) {
    throw new Error(`Refusing to reset database "${database}" because its name is not test-scoped`)
  }

  return database
}

export async function prepareTestDatabase(): Promise<TestCleanup> {
  assertDisposableTestDatabase()

  const resetSchema = await testUtils.db().migrate()

  try {
    const truncateAfterTest = await testUtils.db().truncate()
    await truncateAfterTest()
  } catch (error) {
    await resetSchema()
    throw error
  }

  return resetSchema
}

export function withTransactionIsolation(): Promise<TestCleanup> {
  assertDisposableTestDatabase()
  return testUtils.db().wrapInGlobalTransaction()
}

export function withTruncateIsolation(): Promise<TestCleanup> {
  assertDisposableTestDatabase()
  return testUtils.db().truncate()
}
