import { readFile } from 'node:fs/promises'
import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import app from '@adonisjs/core/services/app'
import router from '@adonisjs/core/services/router'

type DocumentedRoute = {
  methods: string[]
  pattern: string
}

const customerRoute = (pattern: string) =>
  pattern.startsWith('/api/users/') ||
  pattern === '/api/space-catalog' ||
  pattern === '/api/spaces' ||
  pattern === '/api/spaces/:id' ||
  pattern === '/api/spaces/:id/availability' ||
  pattern === '/api/spaces/:spaceId/pricing' ||
  pattern.startsWith('/api/space-media/')

const companyRoute = (pattern: string) =>
  pattern.startsWith('/api/companies/') || pattern.startsWith('/api/company-invitations/')

function assertRouteInventory(assert: Assert, source: string, routes: DocumentedRoute[]) {
  const lines = source.split('\n')
  for (const route of routes) {
    const line = lines.find((candidate) => candidate.includes(`\`${route.pattern}\``))
    assert.exists(line, `Missing documented route ${route.methods.join('|')} ${route.pattern}`)
    for (const method of route.methods) {
      assert.match(
        line!,
        new RegExp(`\\|\\s*[^|]*\\b${method}\\b[^|]*\\|`),
        `Missing method ${method} beside documented path ${route.pattern}`
      )
    }
  }
}

test.group('Mobile documentation contract', () => {
  test('lists every customer and company mobile route with its registered method', async ({
    assert,
  }) => {
    const routes = Object.values(router.toJSON()).flat() as DocumentedRoute[]
    const [userGuide, companyGuide] = await Promise.all([
      readFile(app.makePath('docs/mobile/user-app.md'), 'utf8'),
      readFile(app.makePath('docs/mobile/company-app.md'), 'utf8'),
    ])

    assertRouteInventory(
      assert,
      userGuide,
      routes.filter(({ pattern }) => customerRoute(pattern))
    )
    assertRouteInventory(
      assert,
      companyGuide,
      routes.filter(({ pattern }) => companyRoute(pattern))
    )
  })

  test('keeps session restoration and implemented workflows explicit', async ({ assert }) => {
    const [userGuide, companyGuide] = await Promise.all([
      readFile(app.makePath('docs/mobile/user-app.md'), 'utf8'),
      readFile(app.makePath('docs/mobile/company-app.md'), 'utf8'),
    ])

    assert.include(companyGuide, 'membership.permissions')
    assert.include(companyGuide, 'authoritative permissions')
    assert.notInclude(companyGuide, 'Media upload is not exposed')
    assert.notInclude(userGuide, 'payment itself is not implemented')
    assert.notInclude(userGuide, 'Broad Space discovery is deferred')
    assert.notInclude(userGuide, '/api/halls')
    assert.notInclude(companyGuide, '/api/companies/halls')
    assert.notInclude(companyGuide, 'registrationNumberPdf: string')
    assert.notInclude(companyGuide, 'Mapped legacy Spaces')
  })
})
