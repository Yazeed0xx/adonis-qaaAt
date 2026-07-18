import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { AdminDisputeService } from '#services/admin_dispute_service'
import { serializePaymentDispute } from '#transformers/admin_operation_transformer'
import {
  adminDisputeCreateValidator,
  adminDisputeQueryValidator,
  adminDisputeTransitionValidator,
  adminResourceParamsValidator,
} from '#validators/admin_operation_validator'

@inject()
export default class AdminDisputesController {
  constructor(private disputes: AdminDisputeService) {}

  async index({ request, response }: HttpContext) {
    const input = await request.validateUsing(adminDisputeQueryValidator, { data: request.qs() })
    const rows = await this.disputes.list(input)
    return response.ok({
      data: rows.all().map(serializePaymentDispute),
      metadata: rows.getMeta(),
    })
  }

  async show({ params, request, response }: HttpContext) {
    const { id } = await request.validateUsing(adminResourceParamsValidator, { data: params })
    return response.ok({ data: serializePaymentDispute(await this.disputes.show(id)) })
  }

  async store({ auth, request, response }: HttpContext) {
    const input = await request.validateUsing(adminDisputeCreateValidator)
    return response.created({
      data: serializePaymentDispute(await this.disputes.create(auth.getUserOrFail().id, input)),
    })
  }

  async update({ auth, params, request, response }: HttpContext) {
    const { id } = await request.validateUsing(adminResourceParamsValidator, { data: params })
    const input = await request.validateUsing(adminDisputeTransitionValidator)
    return response.ok({
      data: serializePaymentDispute(
        await this.disputes.transition(auth.getUserOrFail().id, id, input)
      ),
    })
  }
}
