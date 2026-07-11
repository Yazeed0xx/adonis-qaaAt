import type { HttpContext } from '@adonisjs/core/http'
import companyContextService from '#services/company_context_service'
import calendar from '#services/company_calendar_service'
import {
  availabilityPolicyValidator,
  exceptionValidator,
  externalReservationValidator,
  sessionValidator,
} from '#validators/availability_validator'

export default class CompanyCalendarController {
  async index({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.view')
    const records = await calendar.feed(
      companyContext.companyId,
      request.input('from'),
      request.input('to'),
      Math.max(1, Number(request.input('page', 1))),
      Math.min(100, Number(request.input('limit', 20)))
    )
    return response.ok({ data: records.all(), meta: records.getMeta() })
  }
  async showPolicy({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.view')
    return response.ok({
      data: await calendar.getPolicy(companyContext.companyId, Number(params.id)),
    })
  }
  async policy({ companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.manage')
    const result = await calendar.setPolicy(
      companyContext.companyId,
      Number(params.id),
      await request.validateUsing(availabilityPolicyValidator)
    )
    return response.ok({ data: result })
  }
  async exception({ auth, companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.manage')
    const result = await calendar.addException(
      companyContext.companyId,
      Number(params.id),
      auth.getUserOrFail().id,
      await request.validateUsing(exceptionValidator)
    )
    return response.created({ data: result })
  }
  async listExceptions({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.view')
    return response.ok({
      data: await calendar.listExceptions(companyContext.companyId, Number(params.id)),
    })
  }
  async updateException({ auth, companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.manage')
    return response.ok({
      data: await calendar.updateException(
        companyContext.companyId,
        Number(params.id),
        Number(params.exceptionId),
        auth.getUserOrFail().id,
        await request.validateUsing(exceptionValidator)
      ),
    })
  }
  async destroyException({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.manage')
    await calendar.deleteException(
      companyContext.companyId,
      Number(params.id),
      Number(params.exceptionId)
    )
    return response.noContent()
  }
  async listSessions({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.view')
    return response.ok({
      data: await calendar.listSessions(companyContext.companyId, Number(params.id)),
    })
  }
  async createSession({ companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.manage')
    return response.created({
      data: await calendar.saveSession(
        companyContext.companyId,
        Number(params.id),
        await request.validateUsing(sessionValidator)
      ),
    })
  }
  async updateSession({ companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.manage')
    return response.ok({
      data: await calendar.saveSession(
        companyContext.companyId,
        Number(params.id),
        await request.validateUsing(sessionValidator),
        Number(params.sessionId)
      ),
    })
  }
  async destroySession({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.manage')
    await calendar.deleteSession(
      companyContext.companyId,
      Number(params.id),
      Number(params.sessionId)
    )
    return response.noContent()
  }
  async external({ auth, companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.manage')
    const result = await calendar.createExternal(
      companyContext.companyId,
      auth.getUserOrFail().id,
      await request.validateUsing(externalReservationValidator)
    )
    return response.created({ data: result })
  }
  async updateExternal({ auth, companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.manage')
    const result = await calendar.updateExternal(
      companyContext.companyId,
      auth.getUserOrFail().id,
      Number(params.id),
      await request.validateUsing(externalReservationValidator)
    )
    return response.ok({ data: result })
  }
  async destroyExternal({ auth, companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'calendar.manage')
    const result = await calendar.releaseExternal(
      companyContext.companyId,
      auth.getUserOrFail().id,
      Number(params.id)
    )
    return response.ok({ data: result })
  }
}
