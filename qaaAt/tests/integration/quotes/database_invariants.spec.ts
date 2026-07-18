import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { createApprovedCompanyOwner } from '#tests/support/actors'
import { freezeTestTime } from '#tests/support/clock'
import { withTruncateIsolation } from '#tests/support/database'
import { createPricingRecords, createPricingScenario } from '#tests/support/scenarios/pricing'

async function databaseError(operation: () => Promise<unknown>) {
  try {
    await operation()
  } catch (error) {
    return error as { code?: string }
  }
  return null
}

test.group('Quote PostgreSQL invariants', (group) => {
  group.each.setup(withTruncateIsolation)

  test('composite foreign keys reject cross-tenant catalog and cross-quote revision references', async ({
    assert,
  }) => {
    freezeTestTime()
    const scenario = await createPricingScenario()
    const firstRecord = await createPricingRecords(scenario, 'aggregate-first')
    const other = await createApprovedCompanyOwner()
    const [foreignService] = await db
      .table('service_options')
      .insert({
        company_id: other.company.id,
        name_ar: 'شركة أخرى',
        price_minor: '1',
        prices_include_vat: false,
        vat_rate_bps: 1500,
        is_active: true,
        created_at: new Date(),
      })
      .returning('*')
    const catalogTenantError = await databaseError(() =>
      db.table('space_service_options').insert({
        company_id: scenario.company.id,
        space_id: scenario.space.id,
        service_option_id: foreignService.id,
        is_active: true,
        created_at: new Date(),
      })
    )
    assert.equal(catalogTenantError?.code, '23503')

    const first = firstRecord.quote
    const secondRecord = await createPricingRecords(scenario, 'aggregate-second')
    const second = secondRecord.quote
    const foreignRevision = (second.revisions[0] as { id: number }).id
    const currentRevisionError = await databaseError(() =>
      db.from('quotes').where('id', first.id).update({ current_revision_id: foreignRevision })
    )
    assert.equal(currentRevisionError?.code, '23503')
    const eventRevisionError = await databaseError(() =>
      db.table('quote_events').insert({
        quote_id: first.id,
        company_id: scenario.company.id,
        quote_revision_id: foreignRevision,
        action: 'invalid',
        next_status: 'draft',
        created_at: new Date(),
      })
    )
    assert.equal(eventRevisionError?.code, '23503')
  })
})
