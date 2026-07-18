import { createHash } from 'node:crypto'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import UserProfile from '#models/user_profile'
import { createAdmin, createCustomer } from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { withTruncateIsolation } from '#tests/support/database'

const hashVerificationCode = (code: string) => createHash('sha256').update(code).digest('hex')

test.group('Customer authentication', (group) => {
  group.each.setup(withTruncateIsolation)

  test('registration creates an unverified customer and customer-app token', async ({
    client,
    assert,
    db,
  }) => {
    const response = await client.post('/api/users/register').json({
      userName: 'Mohammed Ahmed',
      email: 'mohammed@example.com',
      password: 'password123',
      firstName: 'Mohammed',
      lastName: 'Ahmed',
    })

    response.assertStatus(201)
    response.assertBodyContains({
      message: 'User registered successfully. Please check your email for your verification code.',
      data: {
        user: {
          userName: 'Mohammed Ahmed',
          email: 'mohammed@example.com',
          userType: 'user',
          emailVerified: false,
        },
        token: { type: 'bearer' },
      },
    })
    assert.isString(response.body().data.token.token)

    const user = await User.findByOrFail('email', 'mohammed@example.com')
    db.assertModelExists(user)
    db.assertHas('user_profiles', {
      user_id: user.id,
      first_name: 'Mohammed',
      last_name: 'Ahmed',
    })
    db.assertHas('auth_access_tokens', {
      tokenable_id: user.id,
      abilities: JSON.stringify(['client:customer_app']),
    })
  })

  test('registration rejects duplicate and invalid identities without partial users', async ({
    client,
    db,
  }) => {
    await createCustomer({ email: 'existing@example.com' })

    const duplicate = await client.post('/api/users/register').json({
      userName: 'Duplicate User',
      email: 'existing@example.com',
      password: 'password123',
    })
    duplicate.assertStatus(422)

    const invalid = await client.post('/api/users/register').json({
      userName: 'X',
      email: 'not-an-email',
      password: 'short',
    })
    invalid.assertStatus(422)
    db.assertCount('users', 1)
  })

  test('login returns a customer token and rejects invalid, deleted, and wrong-type identities', async ({
    client,
    assert,
  }) => {
    await createCustomer({
      userName: 'Sara Ali',
      email: 'sara@example.com',
      password: 'password123',
    })
    await createCustomer({
      email: 'deleted@example.com',
      password: 'password123',
      deletedAt: DateTime.now(),
    })
    await createAdmin({ email: 'admin@example.com', password: 'password123' })

    const success = await client.post('/api/users/login').json({
      email: 'sara@example.com',
      password: 'password123',
    })
    success.assertStatus(200)
    success.assertBodyContains({
      message: 'Login successful',
      data: {
        user: { email: 'sara@example.com', userType: 'user', emailVerified: true },
        token: { type: 'bearer' },
      },
    })

    for (const credentials of [
      { email: 'sara@example.com', password: 'wrong-password' },
      { email: 'missing@example.com', password: 'password123' },
      { email: 'deleted@example.com', password: 'password123' },
      { email: 'admin@example.com', password: 'password123' },
    ]) {
      const denied = await client.post('/api/users/login').json(credentials)
      denied.assertStatus(401)
      assert.deepEqual(denied.body(), {
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
      })
    }
  })

  test('me returns the authenticated profile and logout revokes only the current token', async ({
    client,
    assert,
  }) => {
    const user = await createCustomer({
      userName: 'Ahmed Saleh',
      email: 'ahmed@example.com',
      password: 'password123',
    })
    await UserProfile.create({ userId: user.id, firstName: 'Ahmed', lastName: 'Saleh' })
    const first = await User.accessTokens.create(user, ['client:customer_app'])
    const second = await User.accessTokens.create(user, ['client:customer_app'])
    const firstToken = first.value!.release()
    const secondToken = second.value!.release()

    const me = await client.get('/api/users/me').header('Authorization', `Bearer ${firstToken}`)
    me.assertStatus(200)
    me.assertBodyContains({
      data: { user: { id: user.id, email: user.email, userType: 'user', emailVerified: true } },
    })
    assert.notProperty(me.body().data.user, 'password')
    assert.notProperty(me.body().data.user.profile, 'userId')
    assert.notProperty(me.body().data.user.profile, 'createdAt')
    assert.notProperty(me.body().data.user.profile, 'updatedAt')
    assert.notProperty(me.body().data.user.profile, 'deletedAt')

    const logout = await client
      .post('/api/users/logout')
      .header('Authorization', `Bearer ${firstToken}`)
    logout.assertStatus(200)
    logout.assertBody({ message: 'Logged out successfully' })

    const revoked = await client
      .get('/api/users/me')
      .header('Authorization', `Bearer ${firstToken}`)
    revoked.assertStatus(401)
    const surviving = await client
      .get('/api/users/me')
      .header('Authorization', `Bearer ${secondToken}`)
    surviving.assertStatus(200)
  })

  test('email verification enforces valid, unexpired, one-time codes', async ({ client, db }) => {
    const now = freezeTestTime()
    const valid = await createCustomer({ email: 'valid-otp@example.com' })
    valid.emailVerifiedAt = null
    valid.emailVerificationToken = hashVerificationCode('123456')
    valid.emailVerificationExpiresAt = DateTime.fromJSDate(now).plus({ minutes: 10 })
    await valid.save()
    const expired = await createCustomer({ email: 'expired-otp@example.com' })
    expired.emailVerifiedAt = null
    expired.emailVerificationToken = hashVerificationCode('654321')
    expired.emailVerificationExpiresAt = DateTime.fromJSDate(now).minus({ second: 1 })
    await expired.save()

    const invalid = await client.post('/api/users/verify-email').json({
      email: valid.email,
      code: '000000',
    })
    invalid.assertStatus(422)
    invalid.assertBodyContains({ error: { code: 'INVALID_VERIFICATION_CODE' } })

    const expiredResponse = await client.post('/api/users/verify-email').json({
      email: expired.email,
      code: '654321',
    })
    expiredResponse.assertStatus(422)
    expiredResponse.assertBodyContains({ error: { code: 'EXPIRED_VERIFICATION_CODE' } })

    const verified = await client.post('/api/users/verify-email').json({
      email: valid.email,
      code: '123456',
    })
    verified.assertStatus(200)
    verified.assertBodyContains({
      message: 'Email verified successfully',
      data: { user: { id: valid.id, email: valid.email, emailVerified: true } },
    })
    db.assertHas('users', {
      id: valid.id,
      email_verification_token: null,
      email_verification_expires_at: null,
    })

    const reused = await client.post('/api/users/verify-email').json({
      email: valid.email,
      code: '123456',
    })
    reused.assertStatus(409)
    reused.assertBodyContains({ error: { code: 'EMAIL_ALREADY_VERIFIED' } })
  })

  test('resend verification uses the same response for missing and verified accounts', async ({
    client,
  }) => {
    await createCustomer({ email: 'verified@example.com' })
    const expected = {
      message:
        'If an account with that email exists and is not verified, a verification code has been sent.',
    }

    const missing = await client
      .post('/api/users/resend-verification')
      .json({ email: 'missing@example.com' })
    const verified = await client
      .post('/api/users/resend-verification')
      .json({ email: 'verified@example.com' })
    missing.assertStatus(200)
    verified.assertStatus(200)
    missing.assertBody(expected)
    verified.assertBody(expected)
  })
})
