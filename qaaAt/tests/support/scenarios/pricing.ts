import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import type User from '#models/user'
import type Space from '#models/space'
import pricingQuotes from '#services/pricing_quote_service'
import requestWorkflow from '#services/request_workflow_service'
import { responseId, responseResource } from '#tests/support/responses'
import { createInquiryWorkflowScenario, inquiryInput } from '#tests/support/scenarios/requests'

type IdentifiedResource = Record<string, unknown> & { id: number }
type QuoteResource = IdentifiedResource & { revisions: Array<Record<string, unknown>> }
type SentQuoteResource = IdentifiedResource & { current_revision_id: number }

export async function createPricingScenario() {
  const scenario = await createInquiryWorkflowScenario()
  await db.from('rate_plans').where('id', scenario.ratePlan.id).delete()
  return scenario
}

export async function createInquiry(
  client: ApiClient,
  customer: User,
  space: Space,
  startsAt: string,
  endsAt: string,
  idempotencyKey: string
) {
  const response = await client
    .visit('user_requests.create_inquiry')
    .withGuard('api')
    .loginAs(customer)
    .json(inquiryInput(space.id, startsAt, endsAt, idempotencyKey))
  response.assertStatus(201)
  return responseId(response.body())
}

export async function createCatalog(client: ApiClient, owner: User, space: Space) {
  const rateResponse = await client
    .visit('company_pricing.store_rate_plan')
    .withGuard('api')
    .loginAs(owner, companyTokenAbilities(space.companyId))
    .json({
      spaceId: space.id,
      nameAr: 'باقة القاعة',
      pricingMode: 'full_day',
      priceMinor: '100000',
      pricesIncludeVat: false,
      vatRateBps: 1500,
      isActive: true,
    })
  rateResponse.assertStatus(201)
  const rate = responseResource(rateResponse.body()) as IdentifiedResource

  const serviceResponse = await client
    .visit('company_pricing.store_service')
    .withGuard('api')
    .loginAs(owner, companyTokenAbilities(space.companyId))
    .json({
      nameAr: 'ضيافة',
      priceMinor: '10000',
      pricesIncludeVat: false,
      vatRateBps: 1500,
      isActive: true,
    })
  serviceResponse.assertStatus(201)
  const service = responseResource(serviceResponse.body()) as IdentifiedResource

  const attached = await client
    .visit('company_pricing.attach_service', { spaceId: space.id })
    .withGuard('api')
    .loginAs(owner, companyTokenAbilities(space.companyId))
    .json({ serviceOptionId: service.id })
  attached.assertStatus(200)
  return { rate, service }
}

export async function createDraftQuote(
  client: ApiClient,
  owner: User,
  companyId: number,
  inquiryId: number,
  ratePlanId: number,
  serviceOptionId?: number
) {
  const items: Array<{
    sourceType: 'rate_plan' | 'service'
    sourceId: number
    quantity: number
  }> = [{ sourceType: 'rate_plan', sourceId: ratePlanId, quantity: 1 }]
  if (serviceOptionId) {
    items.push({ sourceType: 'service', sourceId: serviceOptionId, quantity: 2 })
  }
  const response = await client
    .visit('company_quotes.store')
    .withGuard('api')
    .loginAs(owner, companyTokenAbilities(companyId))
    .json({
      inquiryId,
      pricesIncludeVat: false,
      vatRateBps: 1500,
      depositPercent: 50,
      items,
    })
  response.assertStatus(201)
  return responseResource(response.body()) as QuoteResource
}

export async function sendQuote(
  client: ApiClient,
  owner: User,
  companyId: number,
  quoteId: number
) {
  const response = await client
    .visit('company_quotes.send', { id: quoteId })
    .withGuard('api')
    .loginAs(owner, companyTokenAbilities(companyId))
    .json({ expiresInHours: 48 })
  response.assertStatus(200)
  return responseResource(response.body()) as SentQuoteResource
}

export async function markQuoteExpired(quoteId: number) {
  const quote = await db.from('quotes').where('id', quoteId).firstOrFail()
  const revision = await db
    .from('quote_revisions')
    .where({ quote_id: quoteId, status: 'draft' })
    .firstOrFail()
  const sentAt = new Date('2026-06-15T06:00:00.000Z')
  const expiresAt = new Date('2026-06-15T08:00:00.000Z')
  await db.from('quote_revisions').where('id', revision.id).update({
    status: 'sent',
    sent_by_membership_id: quote.created_by_membership_id,
    sent_at: sentAt,
    expires_at: expiresAt,
  })
  await db.from('quotes').where('id', quoteId).update({
    status: 'sent',
    current_revision_id: revision.id,
    sent_at: sentAt,
  })
}

export async function createPricingRecords(
  scenario: Awaited<ReturnType<typeof createPricingScenario>>,
  idempotencyKey: string
) {
  const rate = await pricingQuotes.saveRatePlan(scenario.company.id, {
    spaceId: scenario.space.id,
    nameAr: 'باقة القاعة',
    pricingMode: 'full_day',
    priceMinor: '100000',
    pricesIncludeVat: false,
    vatRateBps: 1500,
    isActive: true,
  })
  const inquiry = await requestWorkflow.createInquiry(
    scenario.customer.id,
    inquiryInput(scenario.space.id, scenario.startsAt, scenario.endsAt, idempotencyKey)
  )
  const quote = await pricingQuotes.createQuote(scenario.company.id, scenario.membership.id, {
    inquiryId: inquiry.id,
    pricesIncludeVat: false,
    vatRateBps: 1500,
    depositPercent: 50,
    items: [{ sourceType: 'rate_plan', sourceId: rate.id, quantity: 1 }],
  })
  return { rate, inquiry, quote }
}

export function sendPricingRecord(
  scenario: Awaited<ReturnType<typeof createPricingScenario>>,
  quoteId: number
) {
  return pricingQuotes.sendQuote(scenario.company.id, scenario.membership.id, quoteId, 48)
}
import { companyTokenAbilities } from '#tests/support/company_auth'
