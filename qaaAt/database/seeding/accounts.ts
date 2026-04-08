import { DateTime } from 'luxon'
import { UserFactory } from '#database/factories/user_factory'
import type { DemoScenarioContext } from '#database/seeding/scenario_context'

export async function seedAccounts(context: DemoScenarioContext) {
  const admin = await UserFactory.apply('admin', 'verified')
    .merge({
      userName: 'Admin',
      email: 'admin@qaat.app',
      password: 'admin123',
    })
    .create()

  const [mohammed, sara, ahmed] = await Promise.all([
    createUserWithProfile({
      userName: 'Mohammed Ahmed',
      email: 'mohammed@example.com',
      profile: {
        firstName: 'Mohammed',
        lastName: 'Ahmed',
        phone: '+966501234567',
        address: 'Riyadh, Al Olaya',
      },
    }),
    createUserWithProfile({
      userName: 'Sara Al-Rashid',
      email: 'sara@example.com',
      profile: {
        firstName: 'Sara',
        lastName: 'Al-Rashid',
        phone: '+966507654321',
        address: 'Jeddah, Al Hamra',
      },
    }),
    createUserWithProfile({
      userName: 'Ahmed Hassan',
      email: 'ahmed@example.com',
      profile: {
        firstName: 'Ahmed',
        lastName: 'Hassan',
        phone: '+966509876543',
        address: 'Dammam, Al Faisaliah',
      },
    }),
  ])

  const fatima = await createUserWithProfile({
    userName: 'Fatima Al-Saud',
    email: 'fatima@example.com',
    verified: false,
    profile: {
      firstName: 'Fatima',
      lastName: 'Al-Saud',
      phone: '+966502345678',
      address: 'Riyadh, Al Malaz',
    },
    userOverrides: {
      emailVerificationToken: 'test-verification-token-123',
      emailVerificationExpiresAt: DateTime.now().plus({ days: 1 }),
    },
  })

  context.admin = admin
  context.users.mohammed = mohammed
  context.users.sara = sara
  context.users.ahmed = ahmed
  context.users.fatima = fatima
}

async function createUserWithProfile(options: {
  userName: string
  email: string
  verified?: boolean
  profile: {
    firstName: string
    lastName: string
    phone: string
    address: string
  }
  userOverrides?: Record<string, any>
}) {
  return UserFactory.apply(options.verified === false ? 'unverified' : 'verified')
    .with('userProfile', 1, (profile) => {
      profile.merge(options.profile)
    })
    .merge({
      userName: options.userName,
      email: options.email,
      password: 'password123',
      ...(options.userOverrides || {}),
    })
    .create()
}
