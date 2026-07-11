import vine from '@vinejs/vine'
export const initiatePaymentValidator = vine.create(
  vine.object({ idempotencyKey: vine.string().trim().minLength(8).maxLength(180) })
)
export const cancellationPolicyValidator = vine.create(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(160),
    depositNonRefundable: vine.boolean().optional(),
    tiers: vine
      .array(
        vine.object({
          minimumHours: vine.number().min(0).max(8760),
          refundPercent: vine.number().min(0).max(100),
        })
      )
      .minLength(1)
      .maxLength(10),
  })
)
export const cancellationValidator = vine.create(
  vine.object({
    reason: vine.string().trim().minLength(3).maxLength(1000),
    idempotencyKey: vine.string().trim().minLength(8).maxLength(180),
  })
)
export const refundRetryValidator = vine.create(
  vine.object({ idempotencyKey: vine.string().trim().minLength(8).maxLength(180) })
)
