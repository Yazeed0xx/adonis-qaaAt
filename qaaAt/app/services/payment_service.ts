import { createHash, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import InventoryException from '#exceptions/inventory_exception'
import notificationOutbox from '#services/notification_outbox_service'
import bookingAudit from '#services/booking_audit_service'
import inventoryService from '#services/inventory_service'
import { paymentProvider } from '#services/payment_provider_service'
import { resolvePermissions, type CompanyRole } from '#lib/company_permissions'
import type { VerifiedPaymentEvent } from '../contracts/payment_provider.js'

const MAX = 9_223_372_036_854_775_807n
const WEBHOOK_REPLAY_BATCH = 20
const WEBHOOK_REPLAY_MAX_ATTEMPTS = 5
const WEBHOOK_REPLAY_MAX_AGE_MINUTES = 15
const fail = (message: string, code: string, status = 409): never => {
  throw new InventoryException(message, code, status)
}
const amount = (value: unknown) => {
  try {
    const n = BigInt(String(value))
    if (n < 0n || n > MAX) throw new Error()
    return n
  } catch {
    return fail('Financial amount is invalid', 'QUOTE_AMOUNT_INVALID', 422)
  }
}
const majorToMinor = (value: string) => {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) return fail('Booking has no authoritative payable amount', 'BOOKING_NOT_PAYABLE', 422)
  return amount(BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')))
}
const money = (value: unknown) => amount(value).toString()
const fingerprint = (bookingId: number, purpose: string) =>
  createHash('sha256').update(`${bookingId}:${purpose}`).digest('hex')
const cancellationFingerprint = (
  actor: string,
  actorUserId: number,
  companyId: number | undefined,
  bookingId: number,
  reason: string
) =>
  createHash('sha256')
    .update(JSON.stringify({ actor, actorUserId, companyId: companyId ?? null, bookingId, reason }))
    .digest('hex')
const refundAttemptFingerprint = (refund: any) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        refundId: String(refund.id),
        amountMinor: String(refund.approved_amount_minor),
        currency: refund.currency,
      })
    )
    .digest('hex')

export class PaymentService {
  private async auditFinancial(
    trx: any,
    action: string,
    input: {
      payment?: any
      refund?: any
      bookingId?: number
      companyId?: number
      actorUserId?: number | null
      metadata?: Record<string, unknown>
    }
  ) {
    await trx.table('payment_events').insert({
      payment_id: input.payment?.id ?? input.refund?.payment_id ?? null,
      refund_id: input.refund?.id ?? null,
      booking_id: input.bookingId ?? input.payment?.booking_id ?? input.refund?.booking_id ?? null,
      company_id: input.companyId ?? input.payment?.company_id ?? input.refund?.company_id ?? null,
      actor_user_id: input.actorUserId ?? null,
      action,
      metadata: input.metadata ?? null,
      created_at: new Date(),
    })
  }
  private async companyRecipients(trx: any, companyId: number) {
    const members = await trx
      .from('company_memberships')
      .where({ company_id: companyId, status: 'active' })
    const overrides = members.length
      ? await trx.from('company_membership_permissions').whereIn(
          'company_membership_id',
          members.map((m: any) => m.id)
        )
      : []
    return [
      ...new Set(
        members
          .filter((m: any) =>
            resolvePermissions(
              m.role as CompanyRole,
              overrides
                .filter((o: any) => o.company_membership_id === m.id)
                .map((o: any) => ({ permission: o.permission, effect: o.effect }))
            ).includes('finance.view')
          )
          .map((m: any) => m.user_id)
      ),
    ]
  }
  private async notifyCompany(trx: any, companyId: number, payload: any) {
    for (const userId of await this.companyRecipients(trx, companyId))
      await notificationOutbox.enqueue(
        { ...payload, userId, clientContext: 'company_app', companyId },
        trx
      )
  }
  private serializePayment(row: any, attempt?: any) {
    return {
      id: String(row.id),
      reference: row.reference,
      bookingId: row.booking_id,
      purpose: row.purpose,
      status: row.status,
      currency: row.currency,
      expectedAmountMinor: money(row.expected_amount_minor),
      bookingTotalMinor: money(row.booking_total_minor),
      amountPaidMinor: money(row.amount_paid_minor),
      amountRefundedMinor: money(row.amount_refunded_minor),
      remainingBalanceMinor: money(row.remaining_balance_minor),
      attempt: attempt
        ? {
            id: String(attempt.id),
            reference: attempt.reference,
            status: attempt.status,
            checkoutUrl: attempt.checkout_url,
            expiresAt: attempt.expires_at ?? null,
          }
        : null,
    }
  }
  async payable(userId: number, bookingId: number) {
    const booking = await db
      .from('bookings')
      .where({ id: bookingId, user_id: userId })
      .whereNull('deleted_at')
      .first()
    if (!booking) return fail('Booking not found', 'BOOKING_NOT_FOUND', 404)
    const resolved = await this.resolvePayable(db as any, booking)
    const pricing = await this.payablePricing(db as any, booking)
    const policy = await db
      .from('cancellation_policies')
      .where({ company_id: booking.company_id, is_active: true })
      .orderBy('version', 'desc')
      .first()
    return {
      bookingId,
      status: booking.status,
      currency: 'SAR',
      ...resolved,
      ...pricing,
      cancellationPolicy: policy
        ? {
            id: policy.id,
            version: policy.version,
            name: policy.name,
            tiers: policy.tiers,
            depositNonRefundable: policy.deposit_non_refundable,
          }
        : null,
    }
  }
  private async payablePricing(client: any, booking: any) {
    if (booking.accepted_quote_revision_id) {
      const revision = await client
        .from('quote_revisions')
        .where('id', booking.accepted_quote_revision_id)
        .firstOrFail()
      const lines = await client
        .from('quote_line_items')
        .where('quote_revision_id', revision.id)
        .orderBy('sort_order')
      return {
        lineItems: lines.map((line: any) => ({
          itemType: line.item_type,
          descriptionAr: line.description_ar,
          descriptionEn: line.description_en,
          quantity: line.quantity,
          unitPriceMinor: String(line.unit_price_minor),
          subtotalMinor: String(line.subtotal_minor),
          discountMinor: String(line.discount_minor),
          vatRateBps: line.vat_rate_bps,
          vatMinor: String(line.vat_minor),
          totalMinor: String(line.total_minor),
          pricesIncludeVat: line.prices_include_vat,
        })),
        pricesIncludeVat: revision.prices_include_vat,
        vatRateBps: revision.vat_rate_bps,
        vatMinor: String(revision.vat_minor),
      }
    }
    const snapshot = await client
      .from('booking_pricing_snapshots')
      .where('booking_id', booking.id)
      .first()
    return snapshot
      ? {
          lineItems: snapshot.line_items,
          pricesIncludeVat: snapshot.prices_include_vat,
          vatRateBps: snapshot.vat_rate_bps,
          vatMinor: String(snapshot.vat_minor),
        }
      : { lineItems: [], pricesIncludeVat: null, vatRateBps: null, vatMinor: null }
  }
  private async resolvePayable(client: any, booking: any) {
    let total: bigint
    let payable: bigint
    let purpose: 'deposit' | 'full_payment' = 'full_payment'
    if (booking.accepted_quote_revision_id) {
      total = amount(booking.accepted_total_minor)
      const revision = await client
        .from('quote_revisions')
        .where({
          id: booking.accepted_quote_revision_id,
          quote_id: booking.accepted_quote_id,
          status: 'sent',
        })
        .first()
      if (!revision || amount(revision.total_minor) !== total)
        fail('Accepted Quote snapshot is inconsistent', 'BOOKING_NOT_PAYABLE', 409)
      payable = total
      if (revision.deposit_minor !== null) {
        payable = amount(revision.deposit_minor)
        purpose = 'deposit'
      }
    } else {
      const pricingSnapshot = await client
        .from('booking_pricing_snapshots')
        .where('booking_id', booking.id)
        .first()
      total = pricingSnapshot
        ? amount(pricingSnapshot.total_minor)
        : majorToMinor(String(booking.total_price))
      payable = total
    }
    return {
      purpose,
      payableAmountMinor: payable.toString(),
      bookingTotalMinor: total.toString(),
      remainingBalanceMinor: (total - payable).toString(),
    }
  }
  async initiate(userId: number, bookingId: number, idempotencyKey: string) {
    const provider = paymentProvider()
    const local = await db.transaction(async (trx) => {
      const booking = await trx
        .from('bookings')
        .where({ id: bookingId, user_id: userId })
        .whereNull('deleted_at')
        .forUpdate()
        .first()
      if (!booking) fail('Booking not found', 'BOOKING_NOT_FOUND', 404)
      if (booking.status !== 'accepted')
        fail(
          booking.status === 'confirmed' ? 'Payment already completed' : 'Booking is not payable',
          booking.status === 'confirmed' ? 'PAYMENT_ALREADY_COMPLETED' : 'BOOKING_NOT_PAYABLE'
        )
      const hold = await trx
        .from('booking_holds')
        .where({ booking_id: booking.id, status: 'active' })
        .forUpdate()
        .first()
      if (!hold || DateTime.fromJSDate(hold.expires_at) <= DateTime.now())
        fail('Payment hold expired', 'PAYMENT_HOLD_EXPIRED')
      const values = await this.resolvePayable(trx, booking)
      const policy = await trx
        .from('cancellation_policies')
        .where({ company_id: booking.company_id, is_active: true })
        .orderBy('version', 'desc')
        .first()
      if (!policy)
        fail('Cancellation policy is required before payment', 'CANCELLATION_POLICY_REQUIRED', 422)
      const fp = fingerprint(booking.id, values.purpose)
      const existing = await trx
        .from('payment_attempts')
        .join('payments', 'payments.id', 'payment_attempts.payment_id')
        .where('payment_attempts.user_id', userId)
        .where('payment_attempts.provider', provider.name)
        .where('payment_attempts.idempotency_key', idempotencyKey)
        .select('payment_attempts.*', 'payments.reference as payment_reference')
        .first()
      if (existing) {
        if (existing.request_fingerprint !== fp)
          fail('Idempotency key payload differs', 'PAYMENT_IDEMPOTENCY_CONFLICT')
        return {
          existing: true,
          paymentId: existing.payment_id,
          attemptId: existing.id,
          expiresAt: hold.expires_at,
        }
      }
      let payment = await trx
        .from('payments')
        .where({ booking_id: booking.id, purpose: values.purpose })
        .first()
      if (payment?.status !== undefined && payment.status !== 'pending')
        fail('Payment already completed', 'PAYMENT_ALREADY_COMPLETED')
      if (!payment)
        [payment] = await trx
          .table('payments')
          .insert({
            reference: randomUUID(),
            user_id: userId,
            company_id: booking.company_id,
            booking_id: booking.id,
            quote_id: booking.accepted_quote_id,
            quote_revision_id: booking.accepted_quote_revision_id,
            purpose: values.purpose,
            provider: provider.name,
            expected_amount_minor: values.payableAmountMinor,
            booking_total_minor: values.bookingTotalMinor,
            remaining_balance_minor: values.remainingBalanceMinor,
            created_at: new Date(),
          })
          .returning('*')
      const active = await trx
        .from('payment_attempts')
        .where('payment_id', payment.id)
        .whereIn('status', ['created', 'provider_pending', 'unknown'])
        .first()
      if (active) fail('A payment attempt is already active', 'PAYMENT_ATTEMPT_ACTIVE')
      const [attempt] = await trx
        .table('payment_attempts')
        .insert({
          reference: randomUUID(),
          payment_id: payment.id,
          user_id: userId,
          provider: provider.name,
          idempotency_key: idempotencyKey,
          request_fingerprint: fp,
          requested_amount_minor: values.payableAmountMinor,
          initiated_at: new Date(),
        })
        .returning('*')
      await this.auditFinancial(trx, 'payment.intent_created', {
        payment,
        actorUserId: userId,
        metadata: { attemptId: String(attempt.id), purpose: values.purpose },
      })
      await trx
        .from('bookings')
        .where('id', booking.id)
        .update({
          cancellation_policy_version_id: policy.id,
          cancellation_policy_snapshot: {
            id: policy.id,
            version: policy.version,
            name: policy.name,
            tiers: policy.tiers,
            depositNonRefundable: policy.deposit_non_refundable,
          },
          remaining_total_minor: values.remainingBalanceMinor,
          updated_at: new Date(),
        })
      return {
        existing: false,
        paymentId: payment.id,
        attemptId: attempt.id,
        expiresAt: hold.expires_at,
      }
    })
    if (!local.existing) {
      const attempt = await db.from('payment_attempts').where('id', local.attemptId).firstOrFail()
      try {
        const session = await provider.createPaymentAttempt({
          internalAttemptReference: attempt.reference,
          amountMinor: String(attempt.requested_amount_minor),
          currency: 'SAR',
          expiresAt: DateTime.fromJSDate(local.expiresAt).toUTC().toISO()!,
        })
        await db.transaction(async (trx) => {
          await trx
            .from('payment_attempts')
            .where({ id: attempt.id, status: 'created' })
            .update({
              provider_payment_reference: session.providerPaymentReference,
              provider_attempt_reference: session.providerAttemptReference,
              status: session.status === 'unknown' ? 'unknown' : 'provider_pending',
              checkout_url: session.checkoutUrl,
              updated_at: new Date(),
            })
        })
        await this.replayPendingWebhookEvents(attempt.id)
      } catch {
        await db.from('payment_attempts').where({ id: attempt.id, status: 'created' }).update({
          status: 'unknown',
          failure_code: 'PROVIDER_OUTCOME_UNKNOWN',
          failure_message: 'Provider outcome is unknown',
          updated_at: new Date(),
        })
      }
    }
    return this.getPaymentForUser(userId, local.paymentId)
  }
  async getPaymentForUser(userId: number, paymentId: number) {
    const payment = await db.from('payments').where({ id: paymentId, user_id: userId }).first()
    if (!payment) fail('Payment not found', 'PAYMENT_NOT_FOUND', 404)
    const attempt = await db
      .from('payment_attempts')
      .where('payment_id', payment.id)
      .orderBy('id', 'desc')
      .first()
    return this.serializePayment(payment, attempt)
  }
  async list(scope: 'user' | 'company' | 'admin', ownerId: number, page: number, limit: number) {
    const query = db.from('payments').orderBy('id', 'desc')
    if (scope === 'user') query.where('user_id', ownerId)
    if (scope === 'company') query.where('company_id', ownerId)
    const rows = await query.paginate(page, limit)
    rows.all().forEach((row: any, index: number) => {
      rows.all()[index] = this.serializePayment(row)
    })
    return rows
  }
  async receipt(userId: number, paymentId: number) {
    const row = await db
      .from('booking_invoice_snapshots')
      .join('payments', 'payments.id', 'booking_invoice_snapshots.payment_id')
      .where({ 'payments.id': paymentId, 'payments.user_id': userId })
      .select('booking_invoice_snapshots.*')
      .first()
    if (!row) fail('Receipt is not available', 'PAYMENT_NOT_FOUND', 404)
    return {
      status: row.status,
      ...row.snapshot,
      amountRefundedMinor: String(row.amount_refunded_minor),
      refundStatus: row.status === 'receipt_available' ? null : row.status,
    }
  }
  async createPolicy(
    companyId: number,
    membershipId: number,
    input: {
      name: string
      depositNonRefundable?: boolean
      tiers: Array<{ minimumHours: number; refundPercent: number }>
    }
  ) {
    const sorted = [...input.tiers].sort((a, b) => b.minimumHours - a.minimumHours)
    if (new Set(sorted.map((t) => t.minimumHours)).size !== sorted.length)
      fail('Cancellation tiers overlap', 'CANCELLATION_NOT_ALLOWED', 422)
    return db.transaction(async (trx) => {
      await trx
        .from('cancellation_policies')
        .where({ company_id: companyId, is_active: true })
        .update({ is_active: false, archived_at: new Date() })
      const previous = await trx
        .from('cancellation_policies')
        .where('company_id', companyId)
        .max('version as version')
        .first()
      const [policy] = await trx
        .table('cancellation_policies')
        .insert({
          company_id: companyId,
          name: input.name,
          version: Number(previous?.version ?? 0) + 1,
          is_active: true,
          deposit_non_refundable: input.depositNonRefundable ?? false,
          tiers: JSON.stringify(sorted),
          created_by_membership_id: membershipId,
          created_at: new Date(),
        })
        .returning('*')
      return policy
    })
  }
  async reconciliation(companyId?: number, result?: string) {
    const allowed = [
      'matched',
      'amount_mismatch',
      'currency_mismatch',
      'unknown_provider_reference',
      'late_success',
      'refund_mismatch',
      'unresolved',
    ]
    const query = db.from('reconciliation_records').orderBy('id', 'desc').limit(100)
    if (companyId) query.where('company_id', companyId)
    if (result && allowed.includes(result)) query.where('result', result)
    return query
  }
  async cancelPaidBooking(
    actor: 'customer' | 'company',
    actorUserId: number,
    bookingId: number,
    reason: string,
    idempotencyKey: string,
    companyId?: number
  ) {
    const requestFingerprint = cancellationFingerprint(
      actor,
      actorUserId,
      companyId,
      bookingId,
      reason
    )
    const local = await db.transaction(async (trx) => {
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
        `booking-cancellation:${actor}:${actorUserId}:${idempotencyKey}`,
      ])
      const prior = await trx
        .from('booking_cancellation_idempotency')
        .where({
          actor_user_id: actorUserId,
          actor_scope: actor,
          idempotency_key: idempotencyKey,
        })
        .forUpdate()
        .first()
      if (prior) {
        if (prior.request_fingerprint !== requestFingerprint)
          fail('Cancellation idempotency key payload differs', 'PAYMENT_IDEMPOTENCY_CONFLICT')
        const payment = await trx.from('payments').where('id', prior.payment_id).firstOrFail()
        const refund = prior.refund_id
          ? await trx.from('refunds').where('id', prior.refund_id).firstOrFail()
          : null
        return { refund, payment, existing: true }
      }
      const q = trx.from('bookings').where('id', bookingId).forUpdate()
      if (actor === 'customer') q.where('user_id', actorUserId)
      else q.where('company_id', companyId!)
      const booking = await q.first()
      if (!booking) fail('Booking not found', 'BOOKING_NOT_FOUND', 404)
      if (booking.status !== 'confirmed')
        fail('Cancellation is not allowed', 'CANCELLATION_NOT_ALLOWED')
      const payment = await trx
        .from('payments')
        .where('booking_id', booking.id)
        .where('status', 'paid')
        .forUpdate()
        .first()
      if (!payment) fail('Refund is not allowed', 'REFUND_NOT_ALLOWED')
      if (payment.latest_successful_attempt_id)
        await trx
          .from('payment_attempts')
          .where('id', payment.latest_successful_attempt_id)
          .forUpdate()
          .firstOrFail()
      const snapshot = booking.cancellation_policy_snapshot
      if (!snapshot) fail('Cancellation policy is required', 'CANCELLATION_POLICY_REQUIRED')
      let percent = actor === 'company' ? 100 : 0
      const starts = DateTime.fromJSDate(booking.starts_at)
      const hours = starts.diff(DateTime.now(), 'hours').hours
      if (actor === 'customer') {
        const tier = (snapshot.tiers as Array<any>)
          .filter((t) => hours >= t.minimumHours)
          .sort((a, b) => b.minimumHours - a.minimumHours)[0]
        percent = tier?.refundPercent ?? 0
      }
      let refundable = (amount(payment.amount_paid_minor) * BigInt(percent)) / 100n
      if (payment.purpose === 'deposit' && snapshot.depositNonRefundable && actor === 'customer')
        refundable = 0n
      await trx
        .from('bookings')
        .where('id', booking.id)
        .update({ status: 'cancelled', cancelled_at: new Date(), updated_at: new Date() })
      const block = await trx
        .from('space_inventory_blocks')
        .where({ booking_id: booking.id, status: 'active' })
        .forUpdate()
        .first()
      if (block) {
        await trx
          .from('space_inventory_blocks')
          .where('id', block.id)
          .update({
            status: 'released',
            released_at: new Date(),
            release_reason: `${actor}_cancelled`,
            updated_at: new Date(),
          })
        await inventoryService.audit(
          trx,
          booking.company_id,
          booking.space_id,
          block.id,
          'booking.cancelled_after_payment',
          { bookingId: booking.id, actor, reason },
          actorUserId
        )
      }
      await bookingAudit.record(
        {
          actorUserId,
          bookingId: booking.id,
          companyId: booking.company_id,
          action: 'booking.cancel',
          previousStatus: 'confirmed',
          nextStatus: 'cancelled',
          reason,
          metadata: { refundPercent: percent },
        },
        trx
      )
      await this.auditFinancial(trx, 'booking.cancelled_after_payment', {
        payment,
        actorUserId,
        metadata: { actor, refundPercent: percent, refundableAmountMinor: refundable.toString() },
      })
      if (refundable === 0n) {
        const payload = {
          type: 'booking_cancelled' as const,
          title: 'Booking cancelled',
          message: 'The booking was cancelled with no refundable amount.',
          data: { bookingId: booking.id },
        }
        await notificationOutbox.enqueue(
          { ...payload, userId: booking.user_id, clientContext: 'customer_app' },
          trx
        )
        await this.notifyCompany(trx, booking.company_id, payload)
        await trx.table('booking_cancellation_idempotency').insert({
          actor_user_id: actorUserId,
          actor_scope: actor,
          company_id: booking.company_id,
          booking_id: booking.id,
          payment_id: payment.id,
          refund_id: null,
          idempotency_key: idempotencyKey,
          request_fingerprint: requestFingerprint,
          refundable_amount_minor: '0',
          result_snapshot: { status: 'not_required', amountMinor: '0' },
          created_at: new Date(),
        })
        return { refund: null, payment, existing: false }
      }
      const [refund] = await trx
        .table('refunds')
        .insert({
          reference: randomUUID(),
          payment_id: payment.id,
          booking_id: booking.id,
          company_id: booking.company_id,
          user_id: booking.user_id,
          requested_amount_minor: refundable.toString(),
          approved_amount_minor: refundable.toString(),
          reason,
          source_cancellation_event: `${actor}_cancelled`,
          idempotency_key: idempotencyKey,
          actor_user_id: actorUserId,
          created_at: new Date(),
        })
        .returning('*')
      await trx.table('booking_cancellation_idempotency').insert({
        actor_user_id: actorUserId,
        actor_scope: actor,
        company_id: booking.company_id,
        booking_id: booking.id,
        payment_id: payment.id,
        refund_id: refund.id,
        idempotency_key: idempotencyKey,
        request_fingerprint: requestFingerprint,
        refundable_amount_minor: refundable.toString(),
        result_snapshot: { status: 'requested', amountMinor: refundable.toString() },
        created_at: new Date(),
      })
      const refundPayload = {
        type: 'refund_requested' as const,
        title: 'Refund requested',
        message: 'A cancellation refund was created and sent to the provider.',
        data: { bookingId: booking.id, refundId: String(refund.id) },
      }
      await notificationOutbox.enqueue(
        { ...refundPayload, userId: booking.user_id, clientContext: 'customer_app' },
        trx
      )
      await this.notifyCompany(trx, booking.company_id, refundPayload)
      await this.auditFinancial(trx, 'refund.requested', { refund, actorUserId })
      return { refund, payment, existing: false }
    })
    if (local.refund && !local.existing)
      await this.initiateRefundAttempt(
        local.refund.id,
        `initial-${createHash('sha256').update(idempotencyKey).digest('hex')}`
      )
    if (!local.refund) return { status: 'not_required', amountMinor: '0' }
    return {
      reference: local.refund.reference,
      status: 'requested',
      amountMinor: String(local.refund.approved_amount_minor),
    }
  }

  private serializeRefund(refund: any, attempts: any[]) {
    return {
      id: String(refund.id),
      reference: refund.reference,
      paymentId: String(refund.payment_id),
      bookingId: refund.booking_id,
      status: refund.status,
      requestedAmountMinor: String(refund.requested_amount_minor),
      approvedAmountMinor: String(refund.approved_amount_minor),
      currency: refund.currency,
      reason: refund.reason,
      createdAt: refund.created_at,
      processedAt: refund.processed_at,
      attempts: attempts.map((attempt) => ({
        id: String(attempt.id),
        reference: attempt.reference,
        status: attempt.status,
        failureCode: attempt.failure_code,
        failureMessage: attempt.failure_message,
        createdAt: attempt.created_at,
        updatedAt: attempt.updated_at,
        processedAt: attempt.processed_at,
      })),
    }
  }

  async getRefundForUser(userId: number, refundId: number) {
    const refund = await db.from('refunds').where({ id: refundId, user_id: userId }).first()
    if (!refund) fail('Refund not found', 'REFUND_NOT_FOUND', 404)
    const attempts = await db
      .from('refund_attempts')
      .where('refund_id', refund.id)
      .orderBy('id', 'desc')
      .limit(20)
    return this.serializeRefund(refund, attempts)
  }

  async retryRefund(companyId: number, refundId: number, idempotencyKey: string) {
    const refund = await db.from('refunds').where({ id: refundId, company_id: companyId }).first()
    if (!refund) fail('Refund not found', 'REFUND_NOT_FOUND', 404)
    const attempt = await this.initiateRefundAttempt(refund.id, idempotencyKey)
    const current = await db.from('refunds').where('id', refund.id).firstOrFail()
    return this.serializeRefund(current, [attempt])
  }

  private async initiateRefundAttempt(refundId: number, idempotencyKey: string) {
    const provider = paymentProvider()
    const local = await db.transaction(async (trx) => {
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
        `refund-attempt:${refundId}`,
      ])
      const candidate = await trx.from('refunds').where('id', refundId).first()
      if (!candidate) fail('Refund not found', 'REFUND_NOT_FOUND', 404)
      const booking = await trx
        .from('bookings')
        .where('id', candidate.booking_id)
        .forUpdate()
        .firstOrFail()
      const payment = await trx
        .from('payments')
        .where('id', candidate.payment_id)
        .forUpdate()
        .firstOrFail()
      const successfulPaymentAttempt = await trx
        .from('payment_attempts')
        .where('id', payment.latest_successful_attempt_id)
        .forUpdate()
        .firstOrFail()
      const refund = await trx.from('refunds').where('id', candidate.id).forUpdate().firstOrFail()
      const fp = refundAttemptFingerprint(refund)
      const existing = await trx
        .from('refund_attempts')
        .where({ refund_id: refund.id, provider: provider.name, idempotency_key: idempotencyKey })
        .first()
      if (existing) {
        if (existing.request_fingerprint !== fp)
          fail('Refund retry idempotency payload differs', 'PAYMENT_IDEMPOTENCY_CONFLICT')
        return { existing: true, attempt: existing, refund, payment, successfulPaymentAttempt }
      }
      if (refund.status === 'succeeded')
        fail('Succeeded refund cannot be retried', 'REFUND_FINALIZED')
      const active = await trx
        .from('refund_attempts')
        .where('refund_id', refund.id)
        .whereIn('status', ['created', 'provider_pending', 'unknown'])
        .first()
      if (active) fail('A refund attempt is already active', 'REFUND_ATTEMPT_ACTIVE')
      const [attempt] = await trx
        .table('refund_attempts')
        .insert({
          reference: randomUUID(),
          refund_id: refund.id,
          provider: provider.name,
          idempotency_key: idempotencyKey,
          request_fingerprint: fp,
          requested_amount_minor: String(refund.approved_amount_minor),
          currency: refund.currency,
          created_at: new Date(),
        })
        .returning('*')
      return { existing: false, attempt, refund, payment, successfulPaymentAttempt, booking }
    })
    if (local.existing) return local.attempt
    let providerReferenceCommitted = false
    try {
      const result = await provider.requestRefund({
        internalRefundReference: local.refund.reference,
        providerPaymentReference: local.successfulPaymentAttempt.provider_payment_reference,
        amountMinor: String(local.refund.approved_amount_minor),
        currency: 'SAR',
      })
      await db.transaction(async (trx) => {
        await trx.from('bookings').where('id', local.refund.booking_id).forUpdate().firstOrFail()
        await trx.from('payments').where('id', local.refund.payment_id).forUpdate().firstOrFail()
        await trx
          .from('payment_attempts')
          .where('id', local.payment.latest_successful_attempt_id)
          .forUpdate()
          .firstOrFail()
        await trx.from('refunds').where('id', local.refund.id).forUpdate().firstOrFail()
        await trx.from('refund_attempts').where('id', local.attempt.id).forUpdate().firstOrFail()
        await trx
          .from('refund_attempts')
          .where('id', local.attempt.id)
          .update({
            status: result.status === 'unknown' ? 'unknown' : 'provider_pending',
            provider_refund_reference: result.providerRefundReference,
            updated_at: new Date(),
          })
        await trx.from('refunds').where('id', local.refund.id).update({
          status: 'provider_pending',
          provider_refund_reference: result.providerRefundReference,
          processed_at: null,
        })
      })
      providerReferenceCommitted = true
    } catch (error) {
      await db.transaction(async (trx) => {
        await trx.from('bookings').where('id', local.refund.booking_id).forUpdate().firstOrFail()
        await trx.from('payments').where('id', local.refund.payment_id).forUpdate().firstOrFail()
        await trx
          .from('payment_attempts')
          .where('id', local.payment.latest_successful_attempt_id)
          .forUpdate()
          .firstOrFail()
        await trx.from('refunds').where('id', local.refund.id).forUpdate().firstOrFail()
        await trx.from('refund_attempts').where('id', local.attempt.id).forUpdate().firstOrFail()
        await trx.from('refund_attempts').where('id', local.attempt.id).update({
          status: 'failed',
          failure_code: 'PROVIDER_REFUND_INITIATION_FAILED',
          failure_message: 'Provider refund initiation failed',
          processed_at: new Date(),
          updated_at: new Date(),
        })
        await trx
          .from('refunds')
          .where('id', local.refund.id)
          .update({ status: 'failed', processed_at: new Date() })
        const payload = {
          type: 'refund_failed' as const,
          title: 'Refund needs attention',
          message: 'The provider could not start the refund. It may be retried safely.',
          data: { bookingId: local.refund.booking_id, refundId: String(local.refund.id) },
        }
        await notificationOutbox.enqueue(
          { ...payload, userId: local.refund.user_id, clientContext: 'customer_app' },
          trx
        )
        await this.notifyCompany(trx, local.refund.company_id, payload)
        await this.auditFinancial(trx, 'refund.failed_to_initiate', { refund: local.refund })
      })
    }
    if (providerReferenceCommitted) {
      try {
        await this.replayPendingRefundWebhookEvents(local.refund.id)
      } catch {
        // The durable scheduled replay worker is authoritative for crash/retry recovery.
      }
    }
    return db.from('refund_attempts').where('id', local.attempt.id).firstOrFail()
  }
  async processWebhook(raw: Buffer, signature?: string) {
    const provider = paymentProvider()
    const hash = createHash('sha256').update(raw).digest('hex')
    if (!provider.verifyWebhook(raw, signature))
      fail('Payment signature is invalid', 'PAYMENT_SIGNATURE_INVALID', 401)
    let event: VerifiedPaymentEvent
    try {
      event = provider.parseVerifiedWebhookEvent(raw)
    } catch {
      await db.rawQuery(
        `INSERT INTO payment_webhook_events (provider,provider_event_id,signature_verified,payload_hash,received_at,processed_at,outcome,failure_reason)
         VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (provider,provider_event_id) DO NOTHING`,
        [
          provider.name,
          `invalid_${hash}`,
          true,
          hash,
          new Date(),
          new Date(),
          'rejected',
          'Signed event failed strict validation',
        ]
      )
      return fail('Payment event is invalid', 'PAYMENT_EVENT_INVALID', 422)
    }
    const webhookId = await db.transaction(async (trx) => {
      const inserted = await trx.rawQuery(
        `INSERT INTO payment_webhook_events (provider,provider_event_id,signature_verified,event_type,provider_object_reference,internal_correlation_reference,payload_hash,safe_payload,received_at) VALUES (?,?,?,?,?,?,?,?::jsonb,?) ON CONFLICT (provider,provider_event_id) DO NOTHING RETURNING id`,
        [
          provider.name,
          event.providerEventId,
          true,
          event.eventType,
          event.providerObjectReference,
          (event.internalCorrelationReference ?? null) as any,
          hash,
          JSON.stringify({
            providerEventId: event.providerEventId,
            eventType: event.eventType,
            providerObjectReference: event.providerObjectReference,
            internalCorrelationReference: event.internalCorrelationReference ?? null,
            amountMinor: event.amountMinor,
            currency: event.currency,
            status: event.status,
            occurredAt: event.occurredAt,
            providerSafe: event.safePayload,
          }),
          new Date(),
        ]
      )
      return inserted.rows[0]?.id ?? null
    })
    if (!webhookId) return { outcome: 'duplicate' as const }
    return this.processExistingWebhook(webhookId, event, false)
  }

  private async processExistingWebhook(
    webhookId: number,
    event: VerifiedPaymentEvent,
    reconcileUnknown: boolean
  ) {
    return db.transaction(async (trx) => {
      const webhook = await trx
        .from('payment_webhook_events')
        .where({ id: webhookId, outcome: 'received' })
        .forUpdate()
        .first()
      if (!webhook) return { outcome: 'ignored' as const }
      return this.processClaimedWebhook(trx, webhook, event, reconcileUnknown)
    })
  }

  private async processClaimedWebhook(
    trx: TransactionClientContract,
    webhook: any,
    event: VerifiedPaymentEvent,
    reconcileUnknown: boolean
  ) {
    let outcome: 'processed' | 'reconciliation_required' | 'ignored' | 'received'
    if (event.eventType.startsWith('refund.')) {
      outcome = await this.processRefundEvent(trx, webhook.provider, event, reconcileUnknown)
    } else {
      const attempt = await trx
        .from('payment_attempts')
        .where('provider', webhook.provider)
        .where((query) => {
          query
            .where('provider_attempt_reference', event.providerObjectReference)
            .orWhere('provider_payment_reference', event.providerObjectReference)
          if (event.internalCorrelationReference)
            query.orWhere('reference', event.internalCorrelationReference)
        })
        .first()
      if (!attempt) {
        if (!reconcileUnknown) return { outcome: 'received' as const, replayPending: true }
        await this.reconcile(trx, null, event, 'unknown_provider_reference', webhook.provider)
        outcome = 'reconciliation_required'
      } else if (!attempt.provider_attempt_reference && !attempt.provider_payment_reference) {
        return { outcome: 'received' as const, replayPending: true }
      } else {
        const initialPayment = await trx
          .from('payments')
          .where('id', attempt.payment_id)
          .firstOrFail()
        await trx.from('bookings').where('id', initialPayment.booking_id).forUpdate().firstOrFail()
        const payment = await trx
          .from('payments')
          .where('id', attempt.payment_id)
          .forUpdate()
          .firstOrFail()
        const lockedAttempt = await trx
          .from('payment_attempts')
          .where('id', attempt.id)
          .forUpdate()
          .firstOrFail()
        if (
          event.currency !== payment.currency ||
          amount(event.amountMinor) !== amount(payment.expected_amount_minor)
        ) {
          const result =
            event.currency !== payment.currency ? 'currency_mismatch' : 'amount_mismatch'
          await this.reconcile(trx, payment, event, result)
          outcome = 'reconciliation_required'
        } else if (lockedAttempt.status === 'succeeded') {
          outcome = 'ignored'
        } else if (event.eventType === 'payment.succeeded') {
          outcome = await this.completePayment(trx, payment, lockedAttempt, event)
        } else {
          await trx
            .from('payment_attempts')
            .where('id', lockedAttempt.id)
            .update({
              status: event.eventType === 'payment.cancelled' ? 'cancelled' : 'failed',
              failure_code: event.eventType,
              failure_message: 'Provider reported a safe terminal outcome',
              failed_at: new Date(),
              updated_at: new Date(),
            })
          const payload = {
            type: 'payment_failed' as const,
            title: 'Payment action required',
            message: 'The provider reported that the payment attempt did not complete.',
            data: { bookingId: payment.booking_id, paymentId: String(payment.id) },
          }
          await notificationOutbox.enqueue(
            { ...payload, userId: payment.user_id, clientContext: 'customer_app' },
            trx
          )
          await this.notifyCompany(trx, payment.company_id, payload)
          outcome = 'processed'
        }
      }
    }
    await trx
      .from('payment_webhook_events')
      .where({ id: webhook.id, outcome: 'received' })
      .update({ outcome, processed_at: new Date() })
    return { outcome }
  }

  private async replayPendingWebhookEvents(attemptId: number) {
    const attempt = await db.from('payment_attempts').where('id', attemptId).firstOrFail()
    const references = [
      attempt.provider_attempt_reference,
      attempt.provider_payment_reference,
    ].filter(Boolean)
    const rows = await db
      .from('payment_webhook_events')
      .where({ provider: attempt.provider, outcome: 'received' })
      .where((query) => {
        if (references.length) query.whereIn('provider_object_reference', references)
        query.orWhere('internal_correlation_reference', attempt.reference)
      })
      .limit(20)
    for (const row of rows) {
      const safe = row.safe_payload as VerifiedPaymentEvent
      await this.processExistingWebhook(
        row.id,
        {
          providerEventId: safe.providerEventId,
          eventType: safe.eventType,
          providerObjectReference: safe.providerObjectReference,
          internalCorrelationReference: safe.internalCorrelationReference ?? undefined,
          amountMinor: safe.amountMinor,
          currency: safe.currency,
          status: safe.status,
          occurredAt: safe.occurredAt,
          safePayload: {},
        },
        false
      )
    }
  }

  private async replayPendingRefundWebhookEvents(refundId: number) {
    const refund = await db.from('refunds').where('id', refundId).firstOrFail()
    const attempts = await db
      .from('refund_attempts')
      .where('refund_id', refund.id)
      .whereNotNull('provider_refund_reference')
      .select('provider_refund_reference')
    const references = [
      refund.provider_refund_reference,
      ...attempts.map((attempt) => attempt.provider_refund_reference),
    ].filter(Boolean)
    const rows = await db
      .from('payment_webhook_events')
      .where({ outcome: 'received' })
      .where((query) => {
        query.where('internal_correlation_reference', refund.reference)
        if (references.length) query.orWhereIn('provider_object_reference', references)
      })
      .orderBy('id')
      .limit(WEBHOOK_REPLAY_BATCH)
    for (const row of rows) {
      const safe = row.safe_payload as VerifiedPaymentEvent
      await this.processExistingWebhook(
        row.id,
        {
          providerEventId: safe.providerEventId,
          eventType: safe.eventType,
          providerObjectReference: safe.providerObjectReference,
          internalCorrelationReference: safe.internalCorrelationReference ?? undefined,
          amountMinor: safe.amountMinor,
          currency: safe.currency,
          status: safe.status,
          occurredAt: safe.occurredAt,
          safePayload: {},
        },
        false
      )
    }
  }

  async replayReceivedWebhookEvents(limit = WEBHOOK_REPLAY_BATCH) {
    let processed = 0
    const boundedLimit = Math.max(1, Math.min(limit, WEBHOOK_REPLAY_BATCH))
    while (processed < boundedLimit) {
      const claimed = await db.transaction(async (trx) => {
        const row = await trx
          .from('payment_webhook_events')
          .where('outcome', 'received')
          .where((query) =>
            query
              .whereNull('last_processing_attempt_at')
              .orWhere(
                'last_processing_attempt_at',
                '<=',
                DateTime.now().minus({ minute: 1 }).toSQL()
              )
          )
          .orderBy('received_at')
          .orderBy('id')
          .forUpdate()
          .skipLocked()
          .first()
        if (!row) return false
        const attempts = Number(row.processing_attempts) + 1
        await trx.from('payment_webhook_events').where('id', row.id).update({
          processing_attempts: attempts,
          last_processing_attempt_at: new Date(),
        })
        const ageExpired =
          DateTime.fromJSDate(row.received_at) <=
          DateTime.now().minus({ minutes: WEBHOOK_REPLAY_MAX_AGE_MINUTES })
        const safe = row.safe_payload as VerifiedPaymentEvent
        await this.processClaimedWebhook(
          trx,
          { ...row, processing_attempts: attempts },
          {
            providerEventId: safe.providerEventId,
            eventType: safe.eventType,
            providerObjectReference: safe.providerObjectReference,
            internalCorrelationReference: safe.internalCorrelationReference ?? undefined,
            amountMinor: safe.amountMinor,
            currency: safe.currency,
            status: safe.status,
            occurredAt: safe.occurredAt,
            safePayload: {},
          },
          attempts >= WEBHOOK_REPLAY_MAX_ATTEMPTS || ageExpired
        )
        return true
      })
      if (!claimed) break
      processed++
    }
    return processed
  }
  private async completePayment(
    trx: TransactionClientContract,
    payment: any,
    attempt: any,
    event: VerifiedPaymentEvent
  ): Promise<'processed' | 'reconciliation_required'> {
    const booking = await trx
      .from('bookings')
      .where('id', payment.booking_id)
      .forUpdate()
      .firstOrFail()
    payment = await trx.from('payments').where('id', payment.id).forUpdate().firstOrFail()
    attempt = await trx.from('payment_attempts').where('id', attempt.id).forUpdate().firstOrFail()
    const hold = await trx
      .from('booking_holds')
      .where({ booking_id: booking.id, status: 'active' })
      .forUpdate()
      .first()
    if (
      booking.status !== 'accepted' ||
      !hold ||
      DateTime.fromJSDate(hold.expires_at) <= DateTime.now()
    ) {
      await this.reconcile(
        trx,
        payment,
        {
          ...event,
        },
        'late_success'
      )
      return 'reconciliation_required'
    }
    const block = await trx
      .from('space_inventory_blocks')
      .where({ booking_hold_id: hold.id, status: 'active' })
      .forUpdate()
      .firstOrFail()
    await trx
      .from('space_inventory_blocks')
      .where('id', block.id)
      .update({ booking_id: booking.id, booking_hold_id: null, updated_at: new Date() })
    await trx.from('booking_holds').where('id', hold.id).update({
      status: 'converted',
      released_at: new Date(),
      release_reason: 'trusted_payment_success',
      updated_at: new Date(),
    })
    const paid = amount(payment.expected_amount_minor)
    const remaining = amount(payment.booking_total_minor) - paid
    await trx
      .from('payment_attempts')
      .where('id', attempt.id)
      .update({ status: 'succeeded', succeeded_at: new Date(), updated_at: new Date() })
    await trx.from('payments').where('id', payment.id).update({
      status: 'paid',
      amount_paid_minor: paid.toString(),
      remaining_balance_minor: remaining.toString(),
      latest_successful_attempt_id: attempt.id,
      paid_at: new Date(),
      updated_at: new Date(),
    })
    await trx
      .from('bookings')
      .where('id', booking.id)
      .update({
        status: 'confirmed',
        payment_status: payment.purpose === 'deposit' ? 'deposit_paid' : 'paid',
        paid_total_minor: paid.toString(),
        remaining_total_minor: remaining.toString(),
        confirmed_at: new Date(),
        updated_at: new Date(),
      })
    await inventoryService.audit(
      trx,
      booking.company_id,
      hold.space_id,
      block.id,
      'booking_hold.promoted_after_payment',
      { bookingId: booking.id, holdId: hold.id, paymentId: String(payment.id) }
    )
    await bookingAudit.record(
      {
        actorUserId: null,
        bookingId: booking.id,
        companyId: booking.company_id,
        action: 'booking.confirm',
        previousStatus: 'accepted',
        nextStatus: 'confirmed',
        metadata: { paymentId: String(payment.id) },
      },
      trx
    )
    await this.auditFinancial(trx, 'payment.succeeded', { payment, bookingId: booking.id })
    const customer = await trx
      .from('users')
      .leftJoin('user_profiles', 'user_profiles.user_id', 'users.id')
      .where('users.id', booking.user_id)
      .select('users.user_name', 'user_profiles.first_name', 'user_profiles.last_name')
      .firstOrFail()
    const providerSnapshot = await trx
      .from('companies')
      .leftJoin('company_profiles', 'company_profiles.user_id', 'companies.user_id')
      .where('companies.id', booking.company_id)
      .select('companies.registration_number', 'company_profiles.company_name')
      .firstOrFail()
    const revision = payment.quote_revision_id
      ? await trx.from('quote_revisions').where('id', payment.quote_revision_id).firstOrFail()
      : null
    const pricingSnapshot = revision
      ? null
      : await trx.from('booking_pricing_snapshots').where('booking_id', booking.id).first()
    const lineItems = revision
      ? await trx
          .from('quote_line_items')
          .where('quote_revision_id', revision.id)
          .orderBy('sort_order')
          .select(
            'item_type',
            'description_ar',
            'description_en',
            'quantity',
            'unit_price_minor',
            'discount_minor',
            'vat_rate_bps',
            'vat_minor',
            'total_minor',
            'prices_include_vat'
          )
      : (pricingSnapshot?.line_items ?? [])
    const paidAt = new Date()
    await trx.table('booking_invoice_snapshots').insert({
      payment_id: payment.id,
      booking_id: booking.id,
      snapshot: {
        bookingReference: booking.request_reference ?? String(booking.id),
        paymentReference: payment.reference,
        quoteId: payment.quote_id,
        quoteRevisionId: payment.quote_revision_id,
        customer: {
          displayName:
            [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
            customer.user_name,
        },
        provider: {
          displayName: providerSnapshot.company_name,
          commercialRegistration: providerSnapshot.registration_number,
        },
        spaceId: booking.space_id,
        venueId: booking.venue_id,
        space: {
          nameAr: booking.space_name_snapshot_ar,
          nameEn: booking.space_name_snapshot_en,
        },
        venue: {
          nameAr: booking.venue_name_snapshot_ar,
          nameEn: booking.venue_name_snapshot_en,
        },
        lineItems: revision
          ? lineItems.map((line: any) => ({
              itemType: line.item_type,
              descriptionAr: line.description_ar,
              descriptionEn: line.description_en,
              quantity: line.quantity,
              unitPriceMinor: String(line.unit_price_minor),
              discountMinor: String(line.discount_minor),
              vatRateBps: line.vat_rate_bps,
              vatMinor: String(line.vat_minor),
              totalMinor: String(line.total_minor),
              pricesIncludeVat: line.prices_include_vat,
            }))
          : lineItems,
        currency: 'SAR',
        pricesIncludeVat:
          revision?.prices_include_vat ?? pricingSnapshot?.prices_include_vat ?? null,
        vatRateBps: revision?.vat_rate_bps ?? pricingSnapshot?.vat_rate_bps ?? null,
        vatMinor: revision
          ? String(revision.vat_minor)
          : pricingSnapshot
            ? String(pricingSnapshot.vat_minor)
            : null,
        bookingTotalMinor: String(payment.booking_total_minor),
        paymentPurpose: payment.purpose,
        amountPaidMinor: paid.toString(),
        remainingBalanceMinor: remaining.toString(),
        paidAt: paidAt.toISOString(),
        cancellationPolicy: booking.cancellation_policy_snapshot,
        amountRefundedMinor: '0',
        refundStatus: null,
        zatcaCompliant: false,
      },
      created_at: paidAt,
    })
    const payload = {
      type: 'payment_succeeded' as const,
      title: 'Payment verified',
      message: 'Payment was verified and the booking is confirmed.',
      data: { bookingId: booking.id, paymentId: String(payment.id) },
    }
    await notificationOutbox.enqueue(
      { ...payload, userId: booking.user_id, clientContext: 'customer_app' },
      trx
    )
    await this.notifyCompany(trx, booking.company_id, payload)
    return 'processed'
  }
  private async reconcile(
    trx: any,
    payment: any,
    event: any,
    result: string,
    provider = payment?.provider ?? 'fake'
  ) {
    await trx.table('reconciliation_records').insert({
      payment_id: payment?.id ?? null,
      company_id: payment?.company_id ?? null,
      provider,
      provider_reference: event.providerObjectReference,
      expected_amount_minor: payment?.expected_amount_minor ?? null,
      reported_amount_minor: /^\d+$/.test(String(event.amountMinor)) ? event.amountMinor : null,
      expected_currency: payment?.currency ?? null,
      reported_currency: event.currency,
      internal_status: payment?.status ?? null,
      provider_status: event.status,
      result,
      created_at: new Date(),
      last_checked_at: new Date(),
    })
    await this.auditFinancial(trx, 'payment.reconciliation_required', {
      payment,
      metadata: { result, providerReference: event.providerObjectReference },
    })
    if (payment) {
      const payload = {
        type: 'reconciliation_required' as const,
        title: 'Payment reconciliation required',
        message: 'A provider event did not match the authoritative financial record.',
        data: { paymentId: String(payment.id), result },
      }
      await this.notifyCompany(trx, payment.company_id, payload)
    }
  }
  private async processRefundEvent(
    trx: any,
    provider: string,
    event: VerifiedPaymentEvent,
    reconcileUnknown: boolean
  ): Promise<'processed' | 'reconciliation_required' | 'ignored' | 'received'> {
    const candidateAttempt = await trx
      .from('refund_attempts')
      .where({ provider, provider_refund_reference: event.providerObjectReference })
      .first()
    const candidate = event.internalCorrelationReference
      ? await trx.from('refunds').where('reference', event.internalCorrelationReference).first()
      : candidateAttempt
        ? await trx.from('refunds').where('id', candidateAttempt.refund_id).first()
        : await trx
            .from('refunds')
            .where('provider_refund_reference', event.providerObjectReference)
            .first()
    if (!candidate) {
      if (!reconcileUnknown) return 'received'
      await this.reconcile(trx, null, event, 'unknown_provider_reference', provider)
      return 'reconciliation_required'
    }
    const attemptCandidate =
      candidateAttempt ??
      (await trx
        .from('refund_attempts')
        .where({ refund_id: candidate.id, provider })
        .orderBy('id', 'desc')
        .first())
    if (
      !attemptCandidate ||
      !attemptCandidate.provider_refund_reference ||
      !candidate.provider_refund_reference
    ) {
      if (!reconcileUnknown) return 'received'
      await this.reconcile(trx, null, event, 'unknown_provider_reference', provider)
      return 'reconciliation_required'
    }
    const initialPayment = await trx
      .from('payments')
      .where('id', candidate.payment_id)
      .firstOrFail()
    await trx.from('bookings').where('id', initialPayment.booking_id).forUpdate().firstOrFail()
    const payment = await trx
      .from('payments')
      .where('id', candidate.payment_id)
      .forUpdate()
      .firstOrFail()
    if (payment.latest_successful_attempt_id)
      await trx
        .from('payment_attempts')
        .where('id', payment.latest_successful_attempt_id)
        .forUpdate()
        .firstOrFail()
    const refund = await trx.from('refunds').where('id', candidate.id).forUpdate().firstOrFail()
    const refundAttempt = await trx
      .from('refund_attempts')
      .where('id', attemptCandidate.id)
      .forUpdate()
      .firstOrFail()
    if (refund.status === 'succeeded') return 'ignored'
    if (
      event.currency !== payment.currency ||
      amount(event.amountMinor) !== amount(refund.approved_amount_minor)
    ) {
      await this.reconcile(trx, payment, event, 'refund_mismatch')
      return 'reconciliation_required'
    }
    if (event.eventType === 'refund.failed') {
      await trx
        .from('refunds')
        .where('id', refund.id)
        .update({ status: 'failed', processed_at: new Date() })
      await trx.from('refund_attempts').where('id', refundAttempt.id).update({
        status: 'failed',
        failure_code: event.eventType,
        failure_message: 'Provider reported a refund failure',
        processed_at: new Date(),
        updated_at: new Date(),
      })
      const payload = {
        type: 'refund_failed' as const,
        title: 'Refund needs attention',
        message: 'The refund did not complete and may be retried.',
        data: { bookingId: refund.booking_id, refundId: String(refund.id) },
      }
      await notificationOutbox.enqueue(
        { ...payload, userId: refund.user_id, clientContext: 'customer_app' },
        trx
      )
      await this.notifyCompany(trx, refund.company_id, payload)
      await this.auditFinancial(trx, 'refund.failed', { refund })
    } else {
      const total = amount(payment.amount_refunded_minor) + amount(refund.approved_amount_minor)
      if (total > amount(payment.amount_paid_minor)) {
        await this.reconcile(trx, payment, event, 'refund_mismatch')
        return 'reconciliation_required'
      }
      const next = total === amount(payment.amount_paid_minor) ? 'refunded' : 'partially_refunded'
      await trx
        .from('refunds')
        .where('id', refund.id)
        .update({ status: 'succeeded', processed_at: new Date() })
      await trx.from('refund_attempts').where('id', refundAttempt.id).update({
        status: 'succeeded',
        processed_at: new Date(),
        updated_at: new Date(),
      })
      await trx
        .from('payments')
        .where('id', payment.id)
        .update({ status: next, amount_refunded_minor: total.toString(), updated_at: new Date() })
      await trx
        .from('bookings')
        .where('id', refund.booking_id)
        .update({ status: next, payment_status: next, updated_at: new Date() })
      await trx.from('booking_invoice_snapshots').where('payment_id', payment.id).update({
        status: next,
        amount_refunded_minor: total.toString(),
        updated_at: new Date(),
      })
      const payload = {
        type: 'refund_succeeded' as const,
        title: 'Refund completed',
        message: 'The trusted provider confirmed the refund.',
        data: { bookingId: refund.booking_id, refundId: String(refund.id) },
      }
      await notificationOutbox.enqueue(
        { ...payload, userId: refund.user_id, clientContext: 'customer_app' },
        trx
      )
      await this.notifyCompany(trx, refund.company_id, payload)
      await this.auditFinancial(trx, 'refund.succeeded', {
        refund,
        metadata: { cumulativeRefundedMinor: total.toString() },
      })
    }
    return 'processed'
  }
}

export default new PaymentService()
