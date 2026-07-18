import { test } from '@japa/runner'
import drive from '@adonisjs/drive/services/main'
import { seedAccounts } from '#database/seeding/accounts'
import { seedCompanies } from '#database/seeding/companies'
import {
  seedMobileAcceptance,
  verifyMobileAcceptanceSeed,
} from '#database/seeding/mobile_acceptance'
import { seedReferenceData } from '#database/seeding/reference_data'
import { createScenarioContext } from '#database/seeding/scenario_context'
import { withTruncateIsolation } from '#tests/support/database'

test.group('Mobile acceptance seed contract', (group) => {
  group.each.setup(withTruncateIsolation)
  group.each.setup(() => {
    drive.fake('private')
    return () => drive.restore('private')
  })

  test('creates deterministic actionable scenarios for both mobile apps', async ({ db }) => {
    const context = createScenarioContext()
    await seedReferenceData()
    await seedAccounts(context)
    await seedCompanies(context)

    const seed = await seedMobileAcceptance(context)
    await verifyMobileAcceptanceSeed(seed)

    await db.assertHas('bookings', {
      id: seed.pendingBookingId,
      request_reference: 'MOB-BR-PENDING',
      status: 'pending',
    })
    await db.assertHas('bookings', {
      id: seed.paymentReadyBookingId,
      request_reference: 'MOB-BR-PAYMENT',
      status: 'accepted',
    })
    await db.assertHas('quotes', {
      id: seed.sentQuoteId,
      reference: 'MOB-QT-SENT',
      current_revision_id: seed.sentQuoteRevisionId,
      status: 'sent',
    })
    await db.assertHas('visit_requests', {
      id: seed.alternativeVisitId,
      reference: 'MOB-VR-ALTERNATIVE',
      status: 'alternative_proposed',
    })
    await db.assertCount('space_media', 2)
    await db.assertCount('notifications', 6)
    await db.assertCount('spaces', 2)
  }).timeout(30_000)
})
