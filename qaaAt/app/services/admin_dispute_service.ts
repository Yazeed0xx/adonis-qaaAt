import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import AdminOperationException from '#exceptions/admin_operation_exception'
import adminAuditService from '#services/admin_audit_service'

type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'rejected'

interface CreateDisputeInput {
  paymentId: number
  refundId?: number
  reason: string
}

interface TransitionDisputeInput {
  status: Exclude<DisputeStatus, 'open'>
  resolution?: string
}

const transitions: Record<DisputeStatus, readonly DisputeStatus[]> = {
  open: ['under_review', 'resolved', 'rejected'],
  under_review: ['resolved', 'rejected'],
  resolved: [],
  rejected: [],
}

export class AdminDisputeService {
  async list(input: {
    status?: DisputeStatus
    companyId?: number
    bookingId?: number
    page?: number
    limit?: number
  }) {
    const query = db.from('payment_disputes')
    if (input.status) query.where('status', input.status)
    if (input.companyId) query.where('company_id', input.companyId)
    if (input.bookingId) query.where('booking_id', input.bookingId)
    return query
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .paginate(input.page ?? 1, input.limit ?? 20)
  }

  async show(disputeId: number) {
    const dispute = await db.from('payment_disputes').where('id', disputeId).first()
    if (!dispute)
      throw new AdminOperationException('Dispute not found', 'PAYMENT_DISPUTE_NOT_FOUND', 404)
    return dispute
  }

  async create(adminUserId: number, input: CreateDisputeInput) {
    return db.transaction(async (trx) => {
      const payment = await trx.from('payments').where('id', input.paymentId).forUpdate().first()
      if (!payment) throw new AdminOperationException('Payment not found', 'PAYMENT_NOT_FOUND', 404)

      if (input.refundId) {
        const refund = await trx
          .from('refunds')
          .where({ id: input.refundId, payment_id: payment.id })
          .first()
        if (!refund)
          throw new AdminOperationException(
            'Refund does not belong to this payment',
            'PAYMENT_DISPUTE_REFUND_MISMATCH',
            422
          )
      }

      const active = await trx
        .from('payment_disputes')
        .where('payment_id', payment.id)
        .whereIn('status', ['open', 'under_review'])
        .first()
      if (active)
        throw new AdminOperationException(
          'An active dispute already exists for this payment',
          'PAYMENT_DISPUTE_ACTIVE'
        )

      const [dispute] = await trx
        .table('payment_disputes')
        .insert({
          reference: randomUUID(),
          payment_id: payment.id,
          refund_id: input.refundId ?? null,
          booking_id: payment.booking_id,
          company_id: payment.company_id,
          user_id: payment.user_id,
          opened_by_admin_user_id: adminUserId,
          status: 'open',
          reason: input.reason,
          created_at: new Date(),
        })
        .returning('*')
      await adminAuditService.record(
        {
          adminUserId,
          action: 'payment_dispute.open',
          targetType: 'payment_dispute',
          targetId: dispute.id,
          reason: input.reason,
          metadata: { paymentId: String(payment.id), refundId: input.refundId ?? null },
        },
        trx
      )
      return dispute
    })
  }

  async transition(adminUserId: number, disputeId: number, input: TransitionDisputeInput) {
    return db.transaction(async (trx) => {
      const dispute = await trx.from('payment_disputes').where('id', disputeId).forUpdate().first()
      if (!dispute)
        throw new AdminOperationException('Dispute not found', 'PAYMENT_DISPUTE_NOT_FOUND', 404)
      if (!transitions[dispute.status as DisputeStatus].includes(input.status))
        throw new AdminOperationException(
          `Cannot transition dispute from ${dispute.status} to ${input.status}`,
          'PAYMENT_DISPUTE_INVALID_TRANSITION'
        )
      const terminal = input.status === 'resolved' || input.status === 'rejected'
      if (terminal && !input.resolution)
        throw new AdminOperationException(
          'A resolution is required for a terminal dispute state',
          'PAYMENT_DISPUTE_RESOLUTION_REQUIRED',
          422
        )
      if (!terminal && input.resolution)
        throw new AdminOperationException(
          'A resolution may only be recorded for a terminal dispute state',
          'PAYMENT_DISPUTE_RESOLUTION_INVALID',
          422
        )

      const [updated] = await trx
        .from('payment_disputes')
        .where('id', dispute.id)
        .update({
          status: input.status,
          resolution: terminal ? input.resolution : null,
          resolved_by_admin_user_id: terminal ? adminUserId : null,
          resolved_at: terminal ? new Date() : null,
          updated_at: new Date(),
        })
        .returning('*')
      await adminAuditService.record(
        {
          adminUserId,
          action: `payment_dispute.${input.status}`,
          targetType: 'payment_dispute',
          targetId: dispute.id,
          reason: input.resolution ?? null,
          metadata: { previousStatus: dispute.status, nextStatus: input.status },
        },
        trx
      )
      return updated
    })
  }
}
