import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import { seedAccounts } from '#database/seeding/accounts'
import { seedCompanies } from '#database/seeding/companies'
import { seedReferenceData } from '#database/seeding/reference_data'
import { createScenarioContext } from '#database/seeding/scenario_context'
import {
  mobileSeedAccounts,
  seedMobileAcceptance,
  verifyMobileAcceptanceSeed,
} from '#database/seeding/mobile_acceptance'
import { resolveSeedProfile } from '#database/seeding/profile'

export default class MainSeeder extends BaseSeeder {
  async run() {
    const profile = resolveSeedProfile()
    console.log('Clearing existing data...')
    await db.rawQuery(
      'TRUNCATE TABLE notification_outbox, notifications, booking_audit_logs, admin_audit_logs, bookings, company_profiles, companies, user_profiles, auth_access_tokens, rate_limits, queue_jobs, queue_schedules, users RESTART IDENTITY CASCADE'
    )

    console.log('Seeding database with factory-driven test data...')

    const context = createScenarioContext()

    await seedReferenceData()
    await seedAccounts(context)
    await seedCompanies(context)
    const mobileSeed = await seedMobileAcceptance(context)
    await verifyMobileAcceptanceSeed(mobileSeed)

    console.log('\n========== SEEDING COMPLETE ==========')
    console.log('ADMIN: admin@qaat.app / admin123')
    console.log('USERS: mohammed@example.com, sara@example.com, ahmed@example.com / password123')
    console.log('UNVERIFIED USER: fatima@example.com / password123')
    console.log(
      'COMPANIES: royal@example.com, golden@example.com, star@example.com, quick@example.com / password123'
    )
    console.log('Generated the canonical Venue and Space mobile acceptance dataset')
    console.log(`SEED PROFILE: ${profile}`)
    console.log(`MOBILE CUSTOMER: ${mobileSeedAccounts.customer} / password123`)
    console.log(`MOBILE COMPANY OWNER: ${mobileSeedAccounts.owner} / password123`)
    console.log(
      `MOBILE COMPANY STAFF: ${mobileSeedAccounts.manager}, ${mobileSeedAccounts.bookingStaff}, ${mobileSeedAccounts.calendarStaff}, ${mobileSeedAccounts.accountant} / password123`
    )
    console.log(
      `MOBILE SCENARIOS: pending booking #${mobileSeed.pendingBookingId}, payment-ready booking #${mobileSeed.paymentReadyBookingId}, sent quote #${mobileSeed.sentQuoteId}`
    )
    console.log('Space is the only bookable catalog resource.')
  }
}
