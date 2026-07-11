import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Booking from '#models/booking'
import InventoryException from '#exceptions/inventory_exception'
import inventoryService from '#services/inventory_service'
import notificationOutbox from '#services/notification_outbox_service'
import {
  resolvePermissions,
  type CompanyPermission,
  type CompanyRole,
} from '#lib/company_permissions'

type QuoteItemInput = {
  sourceType: 'rate_plan' | 'package' | 'service' | 'adjustment'
  sourceId?: number
  descriptionAr?: string
  descriptionEn?: string
  quantity: number
  unitPriceMinor?: string
  discountMinor?: string
}

const PG_BIGINT_MAX = 9_223_372_036_854_775_807n

const fail = (message: string, code: string, status = 409): never => {
  throw new InventoryException(message, code, status)
}

const amountInvalid = (): never =>
  fail('Quote monetary value is outside the supported range', 'QUOTE_AMOUNT_INVALID', 422)

const money = (value: unknown) => {
  try {
    const parsed = typeof value === 'bigint' ? value : BigInt(String(value))
    if (parsed < 0n || parsed > PG_BIGINT_MAX) amountInvalid()
    return parsed
  } catch {
    return amountInvalid()
  }
}

const bounded = (value: bigint) => {
  if (value < 0n || value > PG_BIGINT_MAX) amountInvalid()
  return value
}

const roundHalfUp = (numerator: bigint, denominator: bigint) => {
  if (numerator < 0n || denominator <= 0n) amountInvalid()
  return (numerator + denominator / 2n) / denominator
}

const minorToMajor = (minor: bigint) => {
  const whole = minor / 100n
  const fraction = (minor % 100n).toString().padStart(2, '0')
  return `${whole}.${fraction}`
}

export class PricingQuoteService {
  private async recipients(client: any, companyId: number, permission: CompanyPermission) {
    const members = await client
      .from('company_memberships')
      .where({ company_id: companyId, status: 'active' })
    const overrides = members.length
      ? await client.from('company_membership_permissions').whereIn(
          'company_membership_id',
          members.map((m: any) => m.id)
        )
      : []
    return [
      ...new Set(
        members
          .filter((member: any) =>
            resolvePermissions(
              member.role as CompanyRole,
              overrides
                .filter((item: any) => item.company_membership_id === member.id)
                .map((item: any) => ({ permission: item.permission, effect: item.effect }))
            ).includes(permission)
          )
          .map((member: any) => member.user_id)
      ),
    ]
  }

  private async notifyCompany(client: any, companyId: number, payload: any) {
    for (const userId of await this.recipients(client, companyId, 'quotes.view'))
      await notificationOutbox.enqueue({ ...payload, userId }, client)
  }

  private assertLocalized(input: { nameAr?: string; nameEn?: string }) {
    if (!input.nameAr && !input.nameEn)
      fail('At least one localized name is required', 'LOCALIZATION_REQUIRED', 422)
  }

  private validateRatePlan(input: any) {
    this.assertLocalized(input)
    if (
      input.pricingMode === 'custom_quote'
        ? input.priceMinor !== null && input.priceMinor !== undefined
        : input.priceMinor === null || input.priceMinor === undefined
    )
      fail('Price is invalid for pricing mode', 'RATE_PLAN_MODE_INVALID', 422)
    if (
      input.pricingMode !== 'hourly' &&
      (input.minimumDurationMinutes || input.maximumDurationMinutes)
    )
      fail('Duration bounds only apply to hourly plans', 'RATE_PLAN_MODE_INVALID', 422)
    if (input.pricingMode !== 'fixed_session' && (input.fixedDurationMinutes || input.sessionCode))
      fail('Session fields only apply to fixed-session plans', 'RATE_PLAN_MODE_INVALID', 422)
    if (
      input.minimumDurationMinutes &&
      input.maximumDurationMinutes &&
      input.minimumDurationMinutes > input.maximumDurationMinutes
    )
      fail('Minimum duration exceeds maximum duration', 'RATE_PLAN_MODE_INVALID', 422)
  }

  async saveRatePlan(companyId: number, input: any, id?: number) {
    this.validateRatePlan(input)
    const space = await db
      .from('spaces')
      .where({ id: input.spaceId, company_id: companyId })
      .whereNull('deleted_at')
      .firstOrFail()
    const availabilityPolicy = await db
      .from('space_availability_policies')
      .where('space_id', space.id)
      .first()
    if (input.pricingMode === 'hourly' && availabilityPolicy?.mode !== 'hourly')
      fail('Hourly pricing requires hourly availability', 'RATE_PLAN_AVAILABILITY_MISMATCH', 422)
    const values = {
      company_id: companyId,
      space_id: space.id,
      name_ar: input.nameAr ?? null,
      name_en: input.nameEn ?? null,
      pricing_mode: input.pricingMode,
      price_minor:
        input.priceMinor === null || input.priceMinor === undefined
          ? null
          : money(input.priceMinor).toString(),
      prices_include_vat: input.pricesIncludeVat,
      vat_rate_bps: input.vatRateBps,
      minimum_duration_minutes: input.minimumDurationMinutes ?? null,
      maximum_duration_minutes: input.maximumDurationMinutes ?? null,
      fixed_duration_minutes: input.fixedDurationMinutes ?? null,
      session_code: input.sessionCode ?? null,
      is_active: input.isActive ?? false,
      updated_at: new Date(),
    }
    if (id) {
      const historical = await db.from('quote_line_items').where('rate_plan_id', id).first()
      const query = db.from('rate_plans').where({ id, company_id: companyId })
      const existing = await query.clone().firstOrFail()
      if (historical && input.spaceId !== Number(existing.space_id))
        fail('Referenced rate plan cannot change Space', 'HISTORICAL_PRICE_IMMUTABLE', 409)
      await query.update(values)
      return db.from('rate_plans').where({ id, company_id: companyId }).firstOrFail()
    }
    return db
      .table('rate_plans')
      .insert({ ...values, created_at: new Date() })
      .returning('*')
      .then((rows) => rows[0])
  }

  listRatePlans(companyId: number, page: number, limit: number) {
    return db
      .from('rate_plans')
      .where('company_id', companyId)
      .whereNull('archived_at')
      .orderBy('id', 'desc')
      .paginate(page, limit)
  }
  async archiveRatePlan(companyId: number, id: number) {
    await db
      .from('rate_plans')
      .where({ id, company_id: companyId })
      .update({ is_active: false, archived_at: new Date(), updated_at: new Date() })
  }

  async saveService(companyId: number, input: any, id?: number) {
    this.assertLocalized(input)
    const values = {
      company_id: companyId,
      name_ar: input.nameAr ?? null,
      name_en: input.nameEn ?? null,
      description_ar: input.descriptionAr ?? null,
      description_en: input.descriptionEn ?? null,
      price_minor: money(input.priceMinor).toString(),
      prices_include_vat: input.pricesIncludeVat,
      vat_rate_bps: input.vatRateBps,
      is_active: input.isActive ?? false,
      updated_at: new Date(),
    }
    if (id) {
      await db.from('service_options').where({ id, company_id: companyId }).update(values)
      return db.from('service_options').where({ id, company_id: companyId }).firstOrFail()
    }
    return db
      .table('service_options')
      .insert({ ...values, created_at: new Date() })
      .returning('*')
      .then((rows) => rows[0])
  }
  listServices(companyId: number, page: number, limit: number) {
    return db
      .from('service_options')
      .where('company_id', companyId)
      .whereNull('archived_at')
      .orderBy('id', 'desc')
      .paginate(page, limit)
  }
  async archiveService(companyId: number, id: number) {
    await db
      .from('service_options')
      .where({ id, company_id: companyId })
      .update({ is_active: false, archived_at: new Date(), updated_at: new Date() })
  }
  async attachService(companyId: number, spaceId: number, input: any) {
    await db.from('spaces').where({ id: spaceId, company_id: companyId }).firstOrFail()
    await db
      .from('service_options')
      .where({ id: input.serviceOptionId, company_id: companyId })
      .firstOrFail()
    const [row] = await db
      .table('space_service_options')
      .insert({
        company_id: companyId,
        space_id: spaceId,
        service_option_id: input.serviceOptionId,
        is_active: input.isActive ?? true,
        created_at: new Date(),
      })
      .onConflict(['space_id', 'service_option_id'])
      .merge({ is_active: input.isActive ?? true })
      .returning('*')
    return row
  }
  async detachService(companyId: number, spaceId: number, serviceId: number) {
    await db
      .from('space_service_options')
      .where({ company_id: companyId, space_id: spaceId, service_option_id: serviceId })
      .delete()
  }

  async savePackage(companyId: number, input: any, id?: number) {
    this.assertLocalized(input)
    return db.transaction(async (trx) => {
      await trx.from('spaces').where({ id: input.spaceId, company_id: companyId }).firstOrFail()
      for (const item of input.items)
        if (item.serviceOptionId)
          await trx
            .from('service_options')
            .where({ id: item.serviceOptionId, company_id: companyId })
            .firstOrFail()
      const values = {
        company_id: companyId,
        space_id: input.spaceId,
        name_ar: input.nameAr ?? null,
        name_en: input.nameEn ?? null,
        description_ar: input.descriptionAr ?? null,
        description_en: input.descriptionEn ?? null,
        base_price_minor: money(input.basePriceMinor).toString(),
        prices_include_vat: input.pricesIncludeVat,
        vat_rate_bps: input.vatRateBps,
        is_active: input.isActive ?? false,
        updated_at: new Date(),
      }
      let packageId = id
      if (id) {
        const existing = await trx
          .from('packages')
          .where({ id, company_id: companyId })
          .firstOrFail()
        if (
          existing.space_id !== input.spaceId &&
          (await trx.from('quote_line_items').where('package_id', id).first())
        )
          fail('Referenced package cannot change Space', 'HISTORICAL_PRICE_IMMUTABLE', 409)
        await trx.from('packages').where('id', id).update(values)
        await trx.from('package_items').where('package_id', id).delete()
      } else {
        const inserted = await trx
          .table('packages')
          .insert({ ...values, created_at: new Date() })
          .returning('id')
        packageId = inserted[0].id
      }
      if (input.items.length)
        await trx.table('package_items').multiInsert(
          input.items.map((item: any, index: number) => ({
            package_id: packageId,
            company_id: companyId,
            service_option_id: item.serviceOptionId ?? null,
            item_type: item.itemType,
            description_ar: item.descriptionAr ?? null,
            description_en: item.descriptionEn ?? null,
            quantity: item.quantity,
            is_included: item.isIncluded,
            sort_order: index,
            created_at: new Date(),
          }))
        )
      return this.getPackage(trx, companyId, packageId!)
    })
  }
  private async getPackage(client: any, companyId: number, id: number) {
    const row = await client.from('packages').where({ id, company_id: companyId }).firstOrFail()
    row.items = await client.from('package_items').where('package_id', id).orderBy('sort_order')
    return row
  }
  async listPackages(companyId: number, page: number, limit: number) {
    return db
      .from('packages')
      .where('company_id', companyId)
      .whereNull('archived_at')
      .orderBy('id', 'desc')
      .paginate(page, limit)
  }
  async archivePackage(companyId: number, id: number) {
    await db
      .from('packages')
      .where({ id, company_id: companyId })
      .update({ is_active: false, archived_at: new Date(), updated_at: new Date() })
  }

  async publicPricing(spaceId: number) {
    const space = await db
      .from('spaces')
      .join('companies', 'companies.id', 'spaces.company_id')
      .where('spaces.id', spaceId)
      .where('spaces.publication_status', 'published')
      .where('companies.status', 'approved')
      .whereNull('spaces.deleted_at')
      .select('spaces.id', 'spaces.company_id')
      .firstOrFail()
    const [ratePlans, packages, services] = await Promise.all([
      db.from('rate_plans').where({ space_id: space.id, is_active: true }).whereNull('archived_at'),
      db.from('packages').where({ space_id: space.id, is_active: true }).whereNull('archived_at'),
      db
        .from('service_options as so')
        .join('space_service_options as sso', 'sso.service_option_id', 'so.id')
        .where({ 'sso.space_id': space.id, 'sso.is_active': true, 'so.is_active': true })
        .whereNull('so.archived_at')
        .select('so.*'),
    ])
    const publicPackages = []
    for (const item of packages) {
      const packageItems = await db
        .from('package_items as item')
        .leftJoin('service_options as service', function () {
          this.on('service.id', 'item.service_option_id').andOnVal('service.is_active', true)
        })
        .where('item.package_id', item.id)
        .where((query) =>
          query
            .whereNull('item.service_option_id')
            .orWhereNotNull('service.id')
            .orWhereNotNull('item.description_ar')
            .orWhereNotNull('item.description_en')
        )
        .orderBy('item.sort_order')
        .select(
          'item.item_type',
          'item.description_ar',
          'item.description_en',
          'item.quantity',
          'item.is_included',
          'service.name_ar as service_name_ar',
          'service.name_en as service_name_en'
        )
      publicPackages.push({
        id: item.id,
        name: item.name_ar ?? item.name_en,
        nameAr: item.name_ar,
        nameEn: item.name_en,
        description: item.description_ar ?? item.description_en,
        descriptionAr: item.description_ar,
        descriptionEn: item.description_en,
        basePriceMinor: String(item.base_price_minor),
        pricesIncludeVat: item.prices_include_vat,
        vatRateBps: item.vat_rate_bps,
        currency: 'SAR',
        items: packageItems.map((packageItem) => ({
          itemType: packageItem.item_type,
          description:
            packageItem.description_ar ??
            packageItem.service_name_ar ??
            packageItem.description_en ??
            packageItem.service_name_en,
          descriptionAr: packageItem.description_ar ?? packageItem.service_name_ar,
          descriptionEn: packageItem.description_en ?? packageItem.service_name_en,
          quantity: packageItem.quantity,
          isIncluded: packageItem.is_included,
        })),
      })
    }
    return {
      currency: 'SAR',
      ratePlans: ratePlans.map((item) => ({
        id: item.id,
        name: item.name_ar ?? item.name_en,
        nameAr: item.name_ar,
        nameEn: item.name_en,
        pricingMode: item.pricing_mode,
        priceMinor: item.price_minor === null ? null : String(item.price_minor),
        pricesIncludeVat: item.prices_include_vat,
        vatRateBps: item.vat_rate_bps,
        currency: 'SAR',
      })),
      packages: publicPackages,
      serviceOptions: services.map((item) => ({
        id: item.id,
        name: item.name_ar ?? item.name_en,
        nameAr: item.name_ar,
        nameEn: item.name_en,
        description: item.description_ar ?? item.description_en,
        descriptionAr: item.description_ar,
        descriptionEn: item.description_en,
        priceMinor: String(item.price_minor),
        pricesIncludeVat: item.prices_include_vat,
        vatRateBps: item.vat_rate_bps,
        currency: 'SAR',
      })),
    }
  }

  private async calculateLines(
    client: any,
    companyId: number,
    spaceId: number,
    items: QuoteItemInput[],
    includeVat: boolean,
    defaultVat: number
  ) {
    const lines = []
    for (const [sortOrder, item] of items.entries()) {
      let source: any
      if (item.sourceType === 'rate_plan')
        source = await client
          .from('rate_plans')
          .where({ id: item.sourceId, company_id: companyId, space_id: spaceId, is_active: true })
          .whereNull('archived_at')
          .firstOrFail()
      if (item.sourceType === 'package')
        source = await client
          .from('packages')
          .where({ id: item.sourceId, company_id: companyId, space_id: spaceId, is_active: true })
          .whereNull('archived_at')
          .firstOrFail()
      if (item.sourceType === 'service')
        source = await client
          .from('service_options')
          .join(
            'space_service_options',
            'space_service_options.service_option_id',
            'service_options.id'
          )
          .where({
            'service_options.id': item.sourceId,
            'service_options.company_id': companyId,
            'space_service_options.space_id': spaceId,
            'service_options.is_active': true,
            'space_service_options.is_active': true,
          })
          .select('service_options.*')
          .firstOrFail()
      if (
        item.sourceType === 'adjustment' &&
        (item.sourceId ||
          item.unitPriceMinor === null ||
          item.unitPriceMinor === undefined ||
          (!item.descriptionAr && !item.descriptionEn))
      )
        fail(
          'Adjustment requires description and server-authorized unit price',
          'QUOTE_ITEM_INVALID',
          422
        )
      const unit = money(source?.price_minor ?? source?.base_price_minor ?? item.unitPriceMinor)
      const subtotal = bounded(unit * BigInt(item.quantity))
      const discount = money(item.discountMinor ?? '0')
      if (discount > subtotal) amountInvalid()
      const net = subtotal - discount
      const vatRate = BigInt(source?.vat_rate_bps ?? defaultVat)
      const lineIncludesVat = source ? Boolean(source.prices_include_vat) : includeVat
      const vat = lineIncludesVat
        ? roundHalfUp(net * vatRate, 10_000n + vatRate)
        : roundHalfUp(net * vatRate, 10_000n)
      const total = bounded(lineIncludesVat ? net : net + vat)
      lines.push({
        item_type: item.sourceType,
        rate_plan_id: item.sourceType === 'rate_plan' ? source.id : null,
        package_id: item.sourceType === 'package' ? source.id : null,
        service_option_id: item.sourceType === 'service' ? source.id : null,
        description_ar: item.descriptionAr ?? source?.name_ar ?? null,
        description_en: item.descriptionEn ?? source?.name_en ?? null,
        quantity: item.quantity,
        unit_price_minor: unit,
        subtotal_minor: subtotal,
        discount_minor: discount,
        vat_rate_bps: Number(vatRate),
        vat_minor: vat,
        total_minor: total,
        prices_include_vat: lineIncludesVat,
        currency: 'SAR',
        sort_order: sortOrder,
        created_at: new Date(),
      })
    }
    return lines
  }

  async createQuote(companyId: number, membershipId: number, input: any) {
    return db.transaction(async (trx) => {
      const inquiry = await trx
        .from('space_inquiries')
        .join('spaces', 'spaces.id', 'space_inquiries.space_id')
        .join('venues', 'venues.id', 'space_inquiries.venue_id')
        .where('space_inquiries.id', input.inquiryId)
        .where('space_inquiries.company_id', companyId)
        .whereIn('space_inquiries.status', ['open', 'under_review', 'answered'])
        .select(
          'space_inquiries.*',
          'spaces.booking_mode',
          'spaces.name_ar as space_name_ar',
          'spaces.name_en as space_name_en',
          'venues.name_ar as venue_name_ar',
          'venues.name_en as venue_name_en'
        )
        .firstOrFail()
      if (inquiry.booking_mode !== 'quote_required')
        fail('Space does not use quote workflow', 'SPACE_QUOTE_MODE_REQUIRED', 409)
      if (input.visitRequestId)
        await trx
          .from('visit_requests')
          .where({
            id: input.visitRequestId,
            inquiry_id: inquiry.id,
            company_id: companyId,
            user_id: inquiry.user_id,
          })
          .firstOrFail()
      const [quote] = await trx
        .table('quotes')
        .insert({
          reference: `QT-${randomUUID()}`,
          company_id: companyId,
          venue_id: inquiry.venue_id,
          space_id: inquiry.space_id,
          user_id: inquiry.user_id,
          inquiry_id: inquiry.id,
          visit_request_id: input.visitRequestId ?? null,
          created_by_membership_id: membershipId,
          status: 'draft',
          starts_at: inquiry.preferred_starts_at,
          ends_at: inquiry.preferred_ends_at,
          start_local: inquiry.original_start_local,
          end_local: inquiry.original_end_local,
          timezone: inquiry.original_timezone,
          space_name_ar: inquiry.space_name_ar,
          space_name_en: inquiry.space_name_en,
          venue_name_ar: inquiry.venue_name_ar,
          venue_name_en: inquiry.venue_name_en,
          customer_request_snapshot: inquiry.initial_message,
          internal_notes: input.internalNotes ?? null,
          created_at: new Date(),
        })
        .returning('*')
      const revision = await this.createRevision(trx, quote, membershipId, input)
      await trx.from('quotes').where('id', quote.id).update({ current_revision_id: revision.id })
      await this.event(trx, quote, null, 'draft', membershipId, 'quote.created', revision.id)
      return this.detail(trx, companyId, quote.id, true)
    })
  }

  private async createRevision(
    trx: TransactionClientContract,
    quote: any,
    membershipId: number,
    input: any
  ) {
    const latest = await trx
      .from('quote_revisions')
      .where('quote_id', quote.id)
      .max('revision_number as value')
      .first()
    const snapshot = await this.revisionSnapshot(trx, quote.company_id, quote.space_id, input)
    const [revision] = await trx
      .table('quote_revisions')
      .insert({
        quote_id: quote.id,
        company_id: quote.company_id,
        revision_number: Number(latest?.value ?? 0) + 1,
        ...snapshot.values,
        created_by_membership_id: membershipId,
        created_at: new Date(),
      })
      .returning('*')
    await this.insertLines(trx, quote.company_id, revision.id, snapshot.lines)
    return revision
  }

  private async revisionSnapshot(client: any, companyId: number, spaceId: number, input: any) {
    const lines = await this.calculateLines(
      client,
      companyId,
      spaceId,
      input.items,
      input.pricesIncludeVat,
      input.vatRateBps
    )
    const policies = new Set(lines.map((line) => line.prices_include_vat))
    if (policies.size !== 1 || lines[0].prices_include_vat !== input.pricesIncludeVat)
      fail(
        'All quote lines must use one VAT-inclusion display policy',
        'QUOTE_TAX_POLICY_MIXED',
        422
      )
    const subtotal = bounded(lines.reduce((sum, line) => sum + line.subtotal_minor, 0n))
    const discount = bounded(lines.reduce((sum, line) => sum + line.discount_minor, 0n))
    const vat = bounded(lines.reduce((sum, line) => sum + line.vat_minor, 0n))
    const total = bounded(lines.reduce((sum, line) => sum + line.total_minor, 0n))
    const deposit =
      input.depositPercent === null || input.depositPercent === undefined
        ? null
        : bounded(roundHalfUp(total * BigInt(input.depositPercent), 100n))
    return {
      lines,
      values: {
        subtotal_minor: subtotal.toString(),
        discount_minor: discount.toString(),
        vat_minor: vat.toString(),
        total_minor: total.toString(),
        prices_include_vat: lines[0].prices_include_vat,
        vat_rate_bps: input.vatRateBps,
        deposit_percent: input.depositPercent ?? null,
        deposit_minor: deposit?.toString() ?? null,
        remaining_minor: deposit === null ? null : bounded(total - deposit).toString(),
      },
    }
  }

  private async insertLines(
    trx: TransactionClientContract,
    companyId: number,
    revisionId: number,
    lines: any[]
  ) {
    await trx.table('quote_line_items').multiInsert(
      lines.map((line) => ({
        ...line,
        unit_price_minor: line.unit_price_minor.toString(),
        subtotal_minor: line.subtotal_minor.toString(),
        discount_minor: line.discount_minor.toString(),
        vat_minor: line.vat_minor.toString(),
        total_minor: line.total_minor.toString(),
        company_id: companyId,
        quote_revision_id: revisionId,
      }))
    )
  }

  async updateQuote(companyId: number, membershipId: number, quoteId: number, input: any) {
    return db.transaction(async (trx) => {
      const quote = await trx
        .from('quotes')
        .where({ id: quoteId, company_id: companyId })
        .forUpdate()
        .firstOrFail()
      if (!['draft', 'sent'].includes(quote.status))
        fail('Quote cannot be revised', 'QUOTE_INVALID_TRANSITION')
      const existingDraft = await trx
        .from('quote_revisions')
        .where({ quote_id: quote.id, status: 'draft' })
        .orderBy('id', 'desc')
        .first()
      if (existingDraft) {
        const snapshot = await this.revisionSnapshot(trx, quote.company_id, quote.space_id, input)
        await trx.from('quote_line_items').where('quote_revision_id', existingDraft.id).delete()
        await trx.from('quote_revisions').where('id', existingDraft.id).update(snapshot.values)
        await this.insertLines(trx, quote.company_id, existingDraft.id, snapshot.lines)
        await trx
          .from('quotes')
          .where('id', quote.id)
          .update({
            internal_notes: input.internalNotes ?? quote.internal_notes,
            lock_version: quote.lock_version + 1,
            updated_at: new Date(),
          })
        await this.event(
          trx,
          quote,
          quote.status,
          quote.status,
          membershipId,
          'quote.revised',
          existingDraft.id
        )
        return this.detail(trx, companyId, quote.id, true)
      }
      const revision = await this.createRevision(trx, quote, membershipId, input)
      await trx
        .from('quotes')
        .where('id', quote.id)
        .update({
          internal_notes: input.internalNotes ?? quote.internal_notes,
          current_revision_id: quote.status === 'draft' ? revision.id : quote.current_revision_id,
          lock_version: quote.lock_version + 1,
          updated_at: new Date(),
        })
      await this.event(
        trx,
        quote,
        quote.status,
        quote.status,
        membershipId,
        'quote.revised',
        revision.id
      )
      return this.detail(trx, companyId, quote.id, true)
    })
  }

  async sendQuote(
    companyId: number,
    membershipId: number,
    quoteId: number,
    expiresInHours: number
  ) {
    return db.transaction(async (trx) => {
      const quote = await trx
        .from('quotes')
        .where({ id: quoteId, company_id: companyId })
        .forUpdate()
        .firstOrFail()
      if (!['draft', 'sent'].includes(quote.status))
        fail('Quote cannot be sent', 'QUOTE_INVALID_TRANSITION')
      const draft = await trx
        .from('quote_revisions')
        .where({ quote_id: quote.id, status: 'draft' })
        .orderBy('revision_number', 'desc')
        .forUpdate()
        .first()
      if (!draft) fail('No draft revision to send', 'QUOTE_DRAFT_REQUIRED', 422)
      const now = DateTime.now()
      const expires = now.plus({ hours: expiresInHours })
      await trx
        .from('quote_revisions')
        .where({ quote_id: quote.id, status: 'sent' })
        .update({ status: 'superseded' })
      await trx.from('quote_revisions').where('id', draft.id).update({
        status: 'sent',
        sent_by_membership_id: membershipId,
        sent_at: now.toSQL(),
        expires_at: expires.toSQL(),
      })
      await trx
        .from('quotes')
        .where('id', quote.id)
        .update({
          status: 'sent',
          current_revision_id: draft.id,
          sent_at: now.toSQL(),
          lock_version: quote.lock_version + 1,
          updated_at: now.toSQL(),
        })
      await this.event(trx, quote, quote.status, 'sent', membershipId, 'quote.sent', draft.id)
      await notificationOutbox.enqueue(
        {
          userId: quote.user_id,
          type: 'quote_sent',
          title: 'عرض سعر جديد',
          message: 'أرسل مقدم الخدمة عرض سعر جديد',
          data: { quoteId: quote.id, revisionId: draft.id },
        },
        trx
      )
      return this.detail(trx, companyId, quote.id, true)
    })
  }

  async acceptQuote(userId: number, quoteId: number, revisionId?: number) {
    return db.transaction(async (trx) => {
      const quote = await trx
        .from('quotes')
        .where({ id: quoteId, user_id: userId })
        .forUpdate()
        .firstOrFail()
      if (quote.status !== 'sent')
        fail('Quote is not available for acceptance', 'QUOTE_INVALID_TRANSITION')
      const revision = await trx
        .from('quote_revisions')
        .where({ id: quote.current_revision_id, quote_id: quote.id, status: 'sent' })
        .forUpdate()
        .firstOrFail()
      if (revisionId && revisionId !== revision.id)
        fail('Revision is no longer current', 'QUOTE_REVISION_STALE')
      if (!revision.expires_at || DateTime.fromJSDate(revision.expires_at) <= DateTime.now())
        fail('Quote has expired', 'QUOTE_EXPIRED')
      if (quote.booking_id) fail('Quote was already accepted', 'QUOTE_ALREADY_ACCEPTED')
      const space = await trx
        .from('spaces')
        .join('companies', 'companies.id', 'spaces.company_id')
        .join('venues', 'venues.id', 'spaces.venue_id')
        .where('spaces.id', quote.space_id)
        .where('spaces.company_id', quote.company_id)
        .where('spaces.publication_status', 'published')
        .where('companies.status', 'approved')
        .whereNull('spaces.deleted_at')
        .whereNull('companies.deleted_at')
        .select('spaces.*', 'venues.timezone')
        .first()
      if (!space) fail('Space cannot accept this quote', 'SPACE_NOT_APPROVABLE')
      const start = DateTime.fromJSDate(quote.starts_at).setZone(quote.timezone)
      const end = DateTime.fromJSDate(quote.ends_at).setZone(quote.timezone)
      const holdPolicy = await trx
        .from('spaces')
        .join(
          'category_request_response_policies as category_policy',
          'category_policy.category_id',
          'spaces.category_id'
        )
        .leftJoin('space_request_settings as space_setting', 'space_setting.space_id', 'spaces.id')
        .where('spaces.id', quote.space_id)
        .select(
          'category_policy.quote_hold_hours',
          'space_setting.quote_hold_hours as override_hours'
        )
        .firstOrFail()
      const holdExpiry = DateTime.now().plus({
        hours: Number(holdPolicy.override_hours ?? holdPolicy.quote_hold_hours),
      })
      const booking = await Booking.create(
        {
          userId,
          hallId: space.legacy_hall_id,
          companyId: quote.company_id,
          venueId: quote.venue_id,
          spaceId: quote.space_id,
          requestReference: `QB-${randomUUID()}`,
          requestSource: 'space_api',
          bookingDate: start.startOf('day'),
          startTime: start.toFormat('HH:mm'),
          endTime: end.toFormat('HH:mm'),
          totalPrice: minorToMajor(money(revision.total_minor)),
          status: 'pending',
          paymentStatus: 'unpaid',
          expiresAt: holdExpiry,
          responseExpiresAt: holdExpiry,
          submittedAt: DateTime.now(),
          spaceNameSnapshotAr: quote.space_name_ar,
          spaceNameSnapshotEn: quote.space_name_en,
          venueNameSnapshotAr: quote.venue_name_ar,
          venueNameSnapshotEn: quote.venue_name_en,
          contactPreference: 'in_app',
          startsAt: DateTime.fromJSDate(quote.starts_at),
          endsAt: DateTime.fromJSDate(quote.ends_at),
          originalStartLocal: quote.start_local,
          originalEndLocal: quote.end_local,
          originalTimezone: quote.timezone,
        },
        { client: trx }
      )
      const hold = await inventoryService.createBookingHold(
        trx,
        booking,
        quote.company_id,
        holdExpiry
      )
      booking.useTransaction(trx)
      booking.status = 'accepted'
      booking.paymentDueDate = holdExpiry
      booking.companyRespondedAt = DateTime.now()
      booking.acceptedQuoteId = quote.id
      booking.acceptedQuoteRevisionId = revision.id
      booking.acceptedTotalMinor = money(revision.total_minor)
      await booking.save()
      const now = DateTime.now().toSQL()
      await trx
        .from('quotes')
        .where('id', quote.id)
        .update({
          status: 'accepted',
          booking_id: booking.id,
          accepted_revision_id: revision.id,
          accepted_at: now,
          lock_version: quote.lock_version + 1,
          updated_at: now,
        })
      await trx.table('booking_audit_logs').insert({
        booking_id: booking.id,
        company_id: quote.company_id,
        actor_user_id: userId,
        action: 'booking.quote_accept',
        previous_status: 'pending',
        next_status: 'accepted',
        metadata: { quoteId: quote.id, revisionId: revision.id, holdId: hold.holdId },
        created_at: now,
      })
      await this.event(
        trx,
        quote,
        'sent',
        'accepted',
        null,
        'quote.accepted',
        revision.id,
        userId,
        { bookingId: booking.id, holdId: hold.holdId }
      )
      await this.notifyCompany(trx, quote.company_id, {
        type: 'quote_accepted',
        title: 'تم قبول عرض السعر',
        message: 'قبل العميل عرض السعر',
        data: { quoteId: quote.id, bookingId: booking.id },
      })
      return this.detail(trx, quote.company_id, quote.id, false)
    })
  }

  async customerAction(
    userId: number,
    quoteId: number,
    action: 'customer_declined',
    reason?: string
  ) {
    return db.transaction(async (trx) => {
      const quote = await trx
        .from('quotes')
        .where({ id: quoteId, user_id: userId })
        .forUpdate()
        .firstOrFail()
      if (quote.status !== 'sent') fail('Quote cannot be declined', 'QUOTE_INVALID_TRANSITION')
      await trx
        .from('quotes')
        .where('id', quote.id)
        .update({
          status: action,
          declined_at: new Date(),
          lock_version: quote.lock_version + 1,
          updated_at: new Date(),
        })
      await this.event(
        trx,
        quote,
        'sent',
        action,
        null,
        'quote.customer_declined',
        quote.current_revision_id,
        userId,
        undefined,
        reason
      )
      await this.notifyCompany(trx, quote.company_id, {
        type: 'quote_declined',
        title: 'تم رفض عرض السعر',
        message: reason ?? 'رفض العميل عرض السعر',
        data: { quoteId },
      })
      return this.detail(trx, quote.company_id, quote.id, false)
    })
  }

  async withdraw(companyId: number, membershipId: number, quoteId: number, reason?: string) {
    return db.transaction(async (trx) => {
      const quote = await trx
        .from('quotes')
        .where({ id: quoteId, company_id: companyId })
        .forUpdate()
        .firstOrFail()
      if (!['draft', 'sent'].includes(quote.status))
        fail('Quote cannot be withdrawn', 'QUOTE_INVALID_TRANSITION')
      await trx
        .from('quotes')
        .where('id', quote.id)
        .update({
          status: 'withdrawn',
          withdrawn_at: new Date(),
          lock_version: quote.lock_version + 1,
          updated_at: new Date(),
        })
      await this.event(
        trx,
        quote,
        quote.status,
        'withdrawn',
        membershipId,
        'quote.withdrawn',
        quote.current_revision_id,
        undefined,
        undefined,
        reason
      )
      if (quote.status === 'sent')
        await notificationOutbox.enqueue(
          {
            userId: quote.user_id,
            type: 'quote_withdrawn',
            title: 'تم سحب عرض السعر',
            message: reason ?? 'سحب مقدم الخدمة عرض السعر',
            data: { quoteId },
          },
          trx
        )
      return this.detail(trx, companyId, quote.id, true)
    })
  }

  async expire(limit = 100) {
    return db.transaction(async (trx) => {
      const rows = await trx
        .from('quotes')
        .join('quote_revisions', 'quote_revisions.id', 'quotes.current_revision_id')
        .where('quotes.status', 'sent')
        .where('quote_revisions.expires_at', '<=', new Date())
        .select('quotes.*')
        .forUpdate()
        .skipLocked()
        .limit(Math.min(500, Math.max(1, limit)))
      for (const quote of rows) {
        await trx
          .from('quotes')
          .where('id', quote.id)
          .update({
            status: 'expired',
            expired_at: new Date(),
            lock_version: quote.lock_version + 1,
            updated_at: new Date(),
          })
        await this.event(
          trx,
          quote,
          'sent',
          'expired',
          null,
          'quote.expired',
          quote.current_revision_id
        )
        await notificationOutbox.enqueue(
          {
            userId: quote.user_id,
            type: 'quote_expired',
            title: 'انتهت صلاحية عرض السعر',
            message: 'انتهت صلاحية عرض السعر',
            data: { quoteId: quote.id },
          },
          trx
        )
        await this.notifyCompany(trx, quote.company_id, {
          type: 'quote_expired',
          title: 'انتهت صلاحية عرض السعر',
          message: 'انتهت صلاحية عرض السعر',
          data: { quoteId: quote.id },
        })
      }
      return rows.length
    })
  }

  listQuotes(actor: 'company' | 'user' | 'admin', id: number, page: number, limit: number) {
    const query = db.from('quotes').orderBy('created_at', 'desc')
    if (actor === 'company') query.where('company_id', id)
    if (actor === 'user') query.where('user_id', id).whereNot('status', 'draft')
    return query.paginate(page, limit)
  }
  detail(client: any, companyId: number, quoteId: number, internal: boolean) {
    return this.loadDetail(
      client ?? db,
      quoteId,
      internal ? { company_id: companyId } : {},
      internal
    )
  }
  async userDetail(userId: number, quoteId: number) {
    return this.loadDetail(db, quoteId, { user_id: userId }, false)
  }
  private async loadDetail(client: any, quoteId: number, scope: any, internal = true) {
    const quote = await client
      .from('quotes')
      .where({ id: quoteId, ...scope })
      .firstOrFail()
    const revisionsQuery = client
      .from('quote_revisions')
      .where('quote_id', quote.id)
      .orderBy('revision_number', 'desc')
    if (!internal) revisionsQuery.whereIn('status', ['sent', 'superseded'])
    const revisions = await revisionsQuery
    for (const revision of revisions)
      revision.line_items = await client
        .from('quote_line_items')
        .where('quote_revision_id', revision.id)
        .orderBy('sort_order')
    quote.revisions = revisions
    if (!internal) delete quote.internal_notes
    return quote
  }

  private async event(
    client: any,
    quote: any,
    previous: string | null,
    next: string,
    membershipId: number | null,
    action: string,
    revisionId?: number | null,
    actorUserId?: number,
    metadata?: any,
    reason?: string
  ) {
    let actor = actorUserId ?? null
    if (!actor && membershipId) {
      const membership = await client.from('company_memberships').where('id', membershipId).first()
      actor = membership?.user_id ?? null
    }
    await client.table('quote_events').insert({
      quote_id: quote.id,
      company_id: quote.company_id,
      actor_user_id: actor,
      action,
      previous_status: previous,
      next_status: next,
      quote_revision_id: revisionId ?? null,
      reason: reason ?? null,
      metadata: metadata ?? null,
      created_at: new Date(),
    })
  }
}

export default new PricingQuoteService()
