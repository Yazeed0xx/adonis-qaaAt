import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import requestWorkflow from '#services/request_workflow_service'
import companyContextService from '#services/company_context_service'
import BookingTransformer from '#transformers/booking_transformer'
import { RequestWorkflowTransformer } from '#transformers/request_workflow_transformer'
import {
  inquiryResponseValidator,
  requestReasonValidator,
  requestSettingsValidator,
  visitActionValidator,
} from '#validators/request_workflow_validator'

const paging = (request: HttpContext['request']) => ({
  page: Math.max(1, Number(request.input('page', 1)) || 1),
  limit: Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20)),
})

export default class CompanyRequestsController {
  async bookings({ companyContext, request, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'booking_requests.view')
    const { page, limit } = paging(request)
    const rows = await requestWorkflow.listCompanyBookings(
      companyContext.companyId,
      page,
      limit,
      request.input('status')
    )
    return serialize(BookingTransformer.paginate(rows.all(), rows.getMeta()))
  }
  async showBooking({ companyContext, params, serialize }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'booking_requests.view')
    return serialize(
      BookingTransformer.transform(
        await requestWorkflow.getCompanyBooking(companyContext.companyId, Number(params.id))
      )
    )
  }
  async approveBooking({ auth, companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'booking_requests.manage')
    return response.ok({
      data: await requestWorkflow.approveBooking(
        Number(params.id),
        companyContext.companyId,
        auth.getUserOrFail().id
      ),
    })
  }
  async rejectBooking({ auth, companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'booking_requests.manage')
    const payload = await request.validateUsing(requestReasonValidator)
    return response.ok({
      data: await requestWorkflow.rejectBooking(
        Number(params.id),
        companyContext.companyId,
        auth.getUserOrFail().id,
        payload.reason
      ),
    })
  }
  async cancelBooking({ auth, companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'bookings.manage')
    const payload = await request.validateUsing(requestReasonValidator)
    return response.ok({
      data: await requestWorkflow.cancelBookingByCompany(
        Number(params.id),
        companyContext.companyId,
        auth.getUserOrFail().id,
        payload.reason
      ),
    })
  }
  async inquiries({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'inquiries.view')
    const { page, limit } = paging(request)
    const rows = await requestWorkflow.listInquiries(
      'company',
      companyContext.companyId,
      page,
      limit
    )
    return response.ok({
      data: rows.all().map(RequestWorkflowTransformer.companyInquiry),
      meta: rows.getMeta(),
    })
  }
  async showInquiry({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'inquiries.view')
    return response.ok({
      data: RequestWorkflowTransformer.companyInquiry(
        await requestWorkflow.getInquiry('company', companyContext.companyId, Number(params.id))
      ),
    })
  }
  async inquiryMessages({ companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'inquiries.view')
    const { page, limit } = paging(request)
    const rows = await requestWorkflow.listInquiryMessages(
      'company',
      companyContext.companyId,
      Number(params.id),
      page,
      limit
    )
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async answerInquiry({ auth, companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'inquiries.manage')
    return response.ok({
      data: RequestWorkflowTransformer.companyInquiry(
        await requestWorkflow.answerInquiry(
          companyContext.companyId,
          Number(params.id),
          auth.getUserOrFail().id,
          await request.validateUsing(inquiryResponseValidator)
        )
      ),
    })
  }
  async transitionInquiry({ auth, companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'inquiries.manage')
    const input = await request.validateUsing(requestReasonValidator)
    return response.ok({
      data: RequestWorkflowTransformer.companyInquiry(
        await requestWorkflow.transitionInquiry(
          companyContext.companyId,
          Number(params.id),
          auth.getUserOrFail().id,
          params.action === 'start-review' ? 'under_review' : params.action,
          input.reason
        )
      ),
    })
  }
  async visits({ companyContext, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'visits.view')
    const { page, limit } = paging(request)
    const rows = await requestWorkflow.listVisits('company', companyContext.companyId, page, limit)
    return response.ok({
      data: rows.all().map(RequestWorkflowTransformer.companyVisit),
      meta: rows.getMeta(),
    })
  }
  async showVisit({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'visits.view')
    return response.ok({
      data: RequestWorkflowTransformer.companyVisit(
        await requestWorkflow.getVisit('company', companyContext.companyId, Number(params.id))
      ),
    })
  }
  async visitAction({ auth, companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'visits.manage')
    const actions: Record<string, string> = {
      'confirm': 'confirmed',
      'confirmed': 'confirmed',
      'reject': 'rejected',
      'rejected': 'rejected',
      'cancel': 'cancelled',
      'cancelled': 'cancelled',
      'complete': 'completed',
      'completed': 'completed',
      'no-show': 'no_show',
    }
    return response.ok({
      data: RequestWorkflowTransformer.companyVisit(
        await requestWorkflow.transitionVisit(
          companyContext.companyId,
          Number(params.id),
          auth.getUserOrFail().id,
          actions[params.action],
          await request.validateUsing(visitActionValidator)
        )
      ),
    })
  }
  async showSettings({ companyContext, params, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'booking_requests.view')
    const space = await db
      .from('spaces')
      .where('id', params.spaceId)
      .where('company_id', companyContext.companyId)
      .firstOrFail()
    const settings = await db.from('space_request_settings').where('space_id', space.id).first()
    return response.ok({ data: settings })
  }
  async updateSettings({ companyContext, params, request, response }: HttpContext) {
    companyContextService.requirePermission(companyContext, 'booking_requests.manage')
    const space = await db
      .from('spaces')
      .where('id', params.spaceId)
      .where('company_id', companyContext.companyId)
      .firstOrFail()
    const input = await request.validateUsing(requestSettingsValidator)
    const [row] = await db
      .table('space_request_settings')
      .insert({
        company_id: companyContext.companyId,
        space_id: space.id,
        booking_response_hours: input.bookingResponseHours ?? null,
        inquiry_response_hours: input.inquiryResponseHours ?? null,
        visit_response_hours: input.visitResponseHours ?? null,
        quote_hold_hours: input.quoteHoldHours ?? null,
        created_at: new Date(),
      })
      .onConflict('space_id')
      .merge({
        booking_response_hours: input.bookingResponseHours ?? null,
        inquiry_response_hours: input.inquiryResponseHours ?? null,
        visit_response_hours: input.visitResponseHours ?? null,
        quote_hold_hours: input.quoteHoldHours ?? null,
        updated_at: new Date(),
      })
      .returning('*')
    return response.ok({ data: row })
  }
}
