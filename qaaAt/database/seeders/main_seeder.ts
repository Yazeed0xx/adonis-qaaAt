import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import { seedAccounts } from '#database/seeding/accounts'
import { seedBookings } from '#database/seeding/bookings'
import { seedCompanies } from '#database/seeding/companies'
import { seedInventory } from '#database/seeding/inventory'
import { seedNotifications } from '#database/seeding/notifications'
import { createScenarioContext } from '#database/seeding/scenario_context'

export default class MainSeeder extends BaseSeeder {
  async run() {
    console.log('Clearing existing data...')
    await db.rawQuery(
      'TRUNCATE TABLE notifications, booking_services, bookings, services, halls, company_profiles, companies, user_profiles, auth_access_tokens, users RESTART IDENTITY CASCADE'
    )

    console.log('Seeding database with factory-driven test data...')

    const context = createScenarioContext()

    await seedAccounts(context)
    await seedCompanies(context)
    await seedInventory(context)
    await seedBookings(context)
    await seedNotifications(context)

    console.log('\n========== SEEDING COMPLETE ==========')
    console.log('ADMIN: admin@qaat.app / admin123')
    console.log('USERS: mohammed@example.com, sara@example.com, ahmed@example.com / password123')
    console.log('UNVERIFIED USER: fatima@example.com / password123')
    console.log(
      'COMPANIES: royal@example.com, golden@example.com, star@example.com, quick@example.com / password123'
    )
    console.log(
      'Generated demo data with factories for halls, services, bookings, and notifications'
    )
  }
}
