import { freezeTime, test, timeTravel } from '@japa/runner'

const fixedTime = new Date('2020-01-15T09:30:00.000Z')

test.group('Japa time controls', () => {
  test('freezes Date and Date.now at an explicit instant', ({ assert }) => {
    freezeTime(fixedTime)

    assert.equal(new Date().toISOString(), fixedTime.toISOString())
    assert.equal(Date.now(), fixedTime.getTime())
  })

  test('travels relative to a frozen instant', ({ assert }) => {
    freezeTime(fixedTime)
    timeTravel('2 hours')

    assert.equal(new Date().toISOString(), '2020-01-15T11:30:00.000Z')
  })

  test('restores the real clock after each test', ({ assert }) => {
    assert.isAbove(Date.now(), fixedTime.getTime())
  })
})
