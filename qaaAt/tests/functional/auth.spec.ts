import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import User from '#models/user'
import Company from '#models/company'
import CompanyProfile from '#models/company_profile'
import { UserFactory } from '#database/factories/user_factory'

test.group('Auth flows', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('register user returns standardized envelope', async ({ client }) => {
    const response = await client.post('/api/users/register').json({
      userName: 'Mohammed Ahmed',
      email: 'mohammed@example.com',
      password: 'password123',
    })

    response.assertStatus(201)
    response.assertBodyContains({
      message: 'User registered successfully. Please check your email for your verification code.',
      data: {
        user: {
          userName: 'Mohammed Ahmed',
          email: 'mohammed@example.com',
          userType: 'user',
        },
      },
    })

    const user = await User.findByOrFail('email', 'mohammed@example.com')
    response.assertBodyContains({ data: { user: { id: user.id } } })
  })

  test('user login returns standardized success envelope', async ({ client }) => {
    await UserFactory.apply('user', 'verified').merge({
      userName: 'Sara Ali',
      email: 'sara@example.com',
      password: 'password123',
    }).create()

    const response = await client.post('/api/users/login').json({
      email: 'sara@example.com',
      password: 'password123',
    })

    response.assertStatus(200)
    response.assertBodyContains({
      message: 'Login successful',
      data: {
        user: {
          email: 'sara@example.com',
          userType: 'user',
        },
      },
    })
  })

  test('user login returns standardized error envelope for bad credentials', async ({ client }) => {
    const response = await client.post('/api/users/login').json({
      email: 'missing@example.com',
      password: 'wrong-password',
    })

    response.assertStatus(401)
    response.assertBody({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      },
    })
  })

  test('authenticated user me endpoint returns data envelope', async ({ client }) => {
    const user = await UserFactory.apply('user', 'verified')
      .with('userProfile', 1, (profile) => {
        profile.merge({ firstName: 'Ahmed', lastName: 'Saleh' })
      })
      .merge({
        userName: 'Ahmed Saleh',
        email: 'ahmed@example.com',
        password: 'password123',
      })
      .create()

    const response = await client.get('/api/users/me').withGuard('api').loginAs(user)

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        user: {
          id: user.id,
          email: 'ahmed@example.com',
          userType: 'user',
        },
      },
    })
  })

  test('verify email accepts otp code and marks user as verified', async ({ client }) => {
    const response = await client.post('/api/users/register').json({
      userName: 'Otp User',
      email: 'otp@example.com',
      password: 'password123',
    })

    response.assertStatus(201)

    const user = await User.findByOrFail('email', 'otp@example.com')
    const storedCodeHash = user.emailVerificationToken
    const expiresAt = user.emailVerificationExpiresAt

    assert.ok(storedCodeHash)
    assert.ok(expiresAt)

    // Set a known test code so the verify endpoint can be exercised end-to-end.
    user.emailVerificationToken = createHash('sha256').update('123456').digest('hex')
    user.emailVerificationExpiresAt = expiresAt
    await user.save()

    const verifyResponse = await client.post('/api/users/verify-email').json({
      email: 'otp@example.com',
      code: '123456',
    })

    verifyResponse.assertStatus(200)
    verifyResponse.assertBodyContains({
      message: 'Email verified successfully',
      data: {
        user: {
          email: 'otp@example.com',
          emailVerified: true,
        },
      },
    })

    await user.refresh()
    assert.notEqual(user.emailVerifiedAt, null)
    assert.equal(user.emailVerificationToken, null)
  })

  test('company login returns standardized success envelope', async ({ client }) => {
    const user = await UserFactory.apply('company', 'verified').merge({
      userName: 'Royal Events',
      email: 'royal@example.com',
      password: 'password123',
    }).create()

    const company = await Company.create({
      userId: user.id,
      registrationNumber: 'CR-1234567890',
      registrationNumberPdf: 'cr_documents/test.pdf',
      businessAddress: '123 King Fahd Road',
      city: 'Riyadh',
      status: 'approved',
    })

    await CompanyProfile.create({
      userId: user.id,
      companyName: 'Royal Events Co.',
    })

    const response = await client.post('/api/companies/login').json({
      email: 'royal@example.com',
      password: 'password123',
    })

    response.assertStatus(200)
    response.assertBodyContains({
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          userType: 'company',
        },
        company: {
          id: company.id,
          status: 'approved',
        },
      },
    })
  })

  test('admin login returns standardized success envelope', async ({ client }) => {
    await UserFactory.apply('admin', 'verified').merge({
      userName: 'Admin',
      email: 'admin@example.com',
      password: 'password123',
    }).create()

    const response = await client.post('/api/admin/login').json({
      email: 'admin@example.com',
      password: 'password123',
    })

    response.assertStatus(200)
    response.assertBodyContains({
      message: 'Login successful',
      data: {
        user: {
          email: 'admin@example.com',
          userType: 'admin',
        },
      },
    })
  })
})
