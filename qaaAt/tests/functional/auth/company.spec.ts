import { test } from '@japa/runner'
import drive from '@adonisjs/drive/services/main'
import Company from '#models/company'
import User from '#models/user'
import {
  createApprovedCompanyOwner,
  createCompanyMember,
  createCustomer,
} from '#tests/support/actors'
import { withTruncateIsolation } from '#tests/support/database'

test.group('Company authentication and client context', (group) => {
  group.each.setup(withTruncateIsolation)
  group.each.setup(() => {
    drive.fake('private')
    return () => drive.restore('private')
  })

  test('company registration atomically creates its pending owner context', async ({
    client,
    assert,
    db,
  }) => {
    const registrationPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n')
    const response = await client
      .post('/api/companies/register')
      .field('email', 'new-company@example.com')
      .field('password', 'password123')
      .field('companyName', 'New Events Company')
      .field('registrationNumber', 'CR-1000000001')
      .field('businessAddress', 'King Fahd Road')
      .field('city', 'Riyadh')
      .file('registrationNumberPdf', registrationPdf, {
        filename: 'registration.pdf',
        contentType: 'application/pdf',
      })

    response.assertStatus(201)
    response.assertBodyContains({
      message: 'Company registered successfully. Your account is pending admin approval.',
      data: {
        user: { email: 'new-company@example.com', userType: 'company' },
        company: { companyName: 'New Events Company', city: 'Riyadh', status: 'pending' },
        token: { type: 'bearer' },
      },
    })
    assert.isString(response.body().data.token.token)

    const company = await Company.query().where('registrationNumber', 'CR-1000000001').firstOrFail()
    db.assertHas('company_memberships', {
      company_id: company.id,
      user_id: company.userId,
      role: 'owner',
      status: 'active',
    })
    db.assertHas('company_profiles', {
      user_id: company.userId,
      company_name: 'New Events Company',
    })
    db.assertHas('auth_access_tokens', {
      tokenable_id: company.userId,
      abilities: JSON.stringify(['client:company_app', `company:${company.id}`]),
    })
    if (!company.registrationNumberPdf) throw new Error('Registration PDF key was not persisted')
    assert.isTrue(await drive.use('private').exists(company.registrationNumberPdf))
  })

  test('company registration rejects an invalid document without partial records', async ({
    client,
    db,
  }) => {
    const response = await client
      .post('/api/companies/register')
      .field('email', 'invalid-company@example.com')
      .field('password', 'password123')
      .field('companyName', 'Invalid Company')
      .field('registrationNumber', 'CR-1000000002')
      .field('businessAddress', 'King Fahd Road')
      .field('city', 'Riyadh')
      .file('registrationNumberPdf', Buffer.from('%PDF-forged'), {
        filename: 'registration.pdf',
        contentType: 'application/pdf',
      })

    response.assertStatus(422)
    response.assertBodyContains({ error: { code: 'PDF_STRUCTURE_INVALID' } })
    db.assertEmpty('users')
    db.assertEmpty('companies')
    db.assertEmpty('company_memberships')
  })

  test('an invited customer identity with an active membership signs in to the company app', async ({
    client,
    assert,
  }) => {
    const { company } = await createApprovedCompanyOwner({
      user: { email: 'owner@example.com' },
    })
    const { user, membership } = await createCompanyMember(company, 'booking_staff', {
      email: 'employee@example.com',
      password: 'password123',
    })

    const response = await client.post('/api/companies/login').json({
      email: user.email,
      password: 'password123',
    })

    response.assertStatus(200)
    response.assertBodyContains({
      message: 'Login successful',
      data: {
        user: { id: user.id, email: user.email, userType: 'user' },
        company: { id: company.id, status: 'approved' },
        membership: {
          id: membership.id,
          companyId: company.id,
          role: 'booking_staff',
          status: 'active',
        },
        token: { type: 'bearer' },
      },
    })
    assert.include(response.body().data.membership.permissions, 'booking_requests.manage')
    assert.notInclude(response.body().data.membership.permissions, 'members.manage')
    assert.notProperty(response.body().data.company, 'registrationNumberPdf')
    assert.notProperty(response.body().data.company, 'registrationNumber')
    assert.notProperty(response.body().data.company, 'userId')
  })

  test('company login rejects a valid customer identity without an active membership', async ({
    client,
    assert,
  }) => {
    const customer = await createCustomer({
      email: 'customer@example.com',
      password: 'password123',
    })

    const response = await client.post('/api/companies/login').json({
      email: customer.email,
      password: 'password123',
    })

    response.assertStatus(401)
    assert.deepEqual(response.body(), {
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
    })
  })

  test('company login rejects an owner identity whose explicit membership is missing', async ({
    client,
    db,
    assert,
  }) => {
    const actor = await createApprovedCompanyOwner({
      user: { email: 'owner-without-membership@example.com', password: 'password123' },
    })
    await actor.membership.delete()

    const response = await client.post('/api/companies/login').json({
      email: actor.user.email,
      password: 'password123',
    })

    response.assertStatus(401)
    assert.deepEqual(response.body(), {
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
    })
    db.assertMissing('company_memberships', {
      company_id: actor.company.id,
      user_id: actor.user.id,
    })
  })

  test('unscoped and ambiguously scoped tokens cannot enter the company application', async ({
    client,
  }) => {
    const first = await createApprovedCompanyOwner({
      user: { email: 'strict-scope-owner@example.com' },
    })
    const unscoped = await User.accessTokens.create(first.user)
    const ambiguous = await User.accessTokens.create(first.user, [
      'client:company_app',
      `company:${first.company.id}`,
      `company:${first.company.id + 999_999}`,
    ])

    for (const token of [unscoped, ambiguous]) {
      const response = await client
        .get('/api/companies/me')
        .header('Authorization', `Bearer ${token.value!.release()}`)
      response.assertStatus(403)
      response.assertBodyContains({ error: { code: 'COMPANY_SCOPE_REQUIRED' } })
    }
  })

  test('company login resolves its only active membership and scopes the issued token', async ({
    client,
    assert,
    db,
  }) => {
    const owner = await createApprovedCompanyOwner({ user: { email: 'owner@example.com' } })
    const employee = await createCompanyMember(owner.company, 'manager', {
      email: 'single-company@example.com',
      password: 'password123',
    })

    const response = await client.post('/api/companies/login').json({
      email: employee.user.email,
      password: 'password123',
    })

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        company: { id: owner.company.id },
        membership: { companyId: owner.company.id, role: 'manager' },
      },
    })
    assert.notProperty(response.body().data, 'memberships')
    assert.notProperty(response.body().data.company, 'registrationNumberPdf')
    db.assertHas('auth_access_tokens', {
      tokenable_id: employee.user.id,
      abilities: JSON.stringify(['client:company_app', `company:${owner.company.id}`]),
    })
  })

  test('customer and company access tokens cannot cross application boundaries', async ({
    client,
  }) => {
    const { user: owner } = await createApprovedCompanyOwner({
      user: { email: 'boundary-owner@example.com', password: 'password123' },
    })
    const customer = await createCustomer({
      email: 'boundary-customer@example.com',
      password: 'password123',
    })
    const customerLogin = await client
      .post('/api/users/login')
      .json({ email: customer.email, password: 'password123' })
    const companyLogin = await client
      .post('/api/companies/login')
      .json({ email: owner.email, password: 'password123' })
    customerLogin.assertStatus(200)
    companyLogin.assertStatus(200)

    const companyRoute = await client
      .get('/api/companies/members')
      .header('Authorization', `Bearer ${customerLogin.body().data.token.token}`)
    const customerRoute = await client
      .get('/api/users/me')
      .header('Authorization', `Bearer ${companyLogin.body().data.token.token}`)

    companyRoute.assertStatus(403)
    customerRoute.assertStatus(403)
  })

  test('company me refreshes authoritative membership permissions and logout revokes that token', async ({
    client,
    assert,
  }) => {
    const { user, company, membership } = await createApprovedCompanyOwner({
      user: { email: 'session-owner@example.com', password: 'password123' },
    })
    const accessToken = await User.accessTokens.create(user, [
      'client:company_app',
      `company:${company.id}`,
    ])
    const token = accessToken.value!.release()

    const me = await client.get('/api/companies/me').header('Authorization', `Bearer ${token}`)
    me.assertStatus(200)
    me.assertBodyContains({
      data: {
        user: { id: user.id },
        company: { id: company.id },
        membership: { id: membership.id, role: 'owner', status: 'active' },
      },
    })
    assert.include(me.body().data.membership.permissions, 'members.manage')

    const logout = await client
      .post('/api/companies/logout')
      .header('Authorization', `Bearer ${token}`)
    logout.assertStatus(200)
    const revoked = await client.get('/api/companies/me').header('Authorization', `Bearer ${token}`)
    revoked.assertStatus(401)
  })
})
