import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import {
  createApprovedCompanyOwner,
  createCompanyMember,
  createCustomer,
} from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'
import { createNotification } from '#tests/support/scenarios/notifications'

test.group('Company notifications HTTP contract', (group) => {
  group.each.setup(withTruncateIsolation)

  test('allows an active employee to read their own company-app notifications', async ({
    client,
  }) => {
    const owner = await createApprovedCompanyOwner()
    const member = await createCompanyMember(owner.company, 'booking_staff', {
      email: 'booking.staff.notifications@example.com',
    })
    await createNotification(member.user, {
      companyId: owner.company.id,
      type: 'new_booking_request',
      title: 'New booking request',
    })

    const response = await client
      .visit('companies.notification.index')
      .withGuard('api')
      .loginAs(member.user, companyTokenAbilities(member.membership.companyId))

    response.assertStatus(200)
    response.assertBodyContains({ data: [{ title: 'New booking request' }] })
  })

  test('rejects a customer without an active company membership', async ({ client }) => {
    const { company } = await createApprovedCompanyOwner()
    const customer = await createCustomer({ email: 'no.company.membership@example.com' })
    const response = await client
      .visit('companies.notification.index')
      .withGuard('api')
      .loginAs(customer, companyTokenAbilities(company))

    response.assertStatus(403)
    response.assertBodyContains({ error: { code: 'COMPANY_MEMBERSHIP_REQUIRED' } })
  })

  test('scopes list, count, and read mutations to the member company', async ({
    client,
    assert,
  }) => {
    const first = await createApprovedCompanyOwner()
    const second = await createApprovedCompanyOwner()
    const employee = await createCompanyMember(first.company, 'booking_staff', {
      email: 'shared.company.notifications@example.com',
    })
    await createNotification(employee.user, {
      companyId: first.company.id,
      title: 'First company alert',
    })
    await createNotification(employee.user, {
      companyId: second.company.id,
      title: 'Second company alert',
    })

    const firstToken = await User.accessTokens.create(employee.user, [
      'client:company_app',
      `company:${first.company.id}`,
    ])
    const customerToken = await User.accessTokens.create(employee.user, ['client:customer_app'])
    const firstHeaders = { Authorization: `Bearer ${firstToken.value!.release()}` }

    const firstList = await client.visit('companies.notification.index').headers(firstHeaders)
    firstList.assertStatus(200)
    assert.deepEqual(
      firstList.body().data.map((notification: { title: string }) => notification.title),
      ['First company alert']
    )
    const secondNotification = await db
      .from('notifications')
      .where('title', 'Second company alert')
      .firstOrFail()
    const crossCompanyRead = await client
      .visit('companies.notification.markAsRead', { id: secondNotification.id })
      .headers(firstHeaders)
    crossCompanyRead.assertStatus(404)
    const firstReadAll = await client
      .visit('companies.notification.markAllAsRead')
      .headers(firstHeaders)
    firstReadAll.assertStatus(200)
    firstReadAll.assertBodyContains({ data: { markedCount: 1 } })
    const unreadCount = await client
      .visit('companies.notification.unreadCount')
      .headers(firstHeaders)
    unreadCount.assertStatus(200)
    unreadCount.assertBodyContains({ data: { unreadCount: 0 } })

    const customerList = await client
      .visit('users.notification.index')
      .header('Authorization', `Bearer ${customerToken.value!.release()}`)
    customerList.assertStatus(200)
    assert.deepEqual(customerList.body().data, [])
  })

  test('rejects an inactive membership without leaking notification data', async ({
    client,
    assert,
  }) => {
    const owner = await createApprovedCompanyOwner()
    const member = await createCompanyMember(owner.company, 'manager', {
      email: 'inactive.notifications@example.com',
    })
    await db.from('company_memberships').where('id', member.membership.id).update({
      status: 'revoked',
    })
    await createNotification(member.user, {
      companyId: owner.company.id,
      title: 'Tenant-private alert',
    })

    const response = await client
      .visit('companies.notification.index')
      .withGuard('api')
      .loginAs(member.user, companyTokenAbilities(member.membership.companyId))

    response.assertStatus(403)
    assert.notInclude(JSON.stringify(response.body()), 'Tenant-private alert')
  })
})
import { companyTokenAbilities } from '#tests/support/company_auth'
