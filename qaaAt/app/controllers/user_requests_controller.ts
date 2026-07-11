import type { HttpContext } from '@adonisjs/core/http'
import requestWorkflow from '#services/request_workflow_service'
import BookingTransformer from '#transformers/booking_transformer'
import {
  createDateInquiryValidator,
  createSpaceBookingRequestValidator,
  createVisitRequestValidator,
} from '#validators/request_workflow_validator'

const paging = (request: HttpContext['request']) => ({
  page: Math.max(1, Number(request.input('page', 1)) || 1),
  limit: Math.min(100, Math.max(1, Number(request.input('limit', 20)) || 20)),
})

export default class UserRequestsController {
  async storeBooking({ auth, request, response, serialize }: HttpContext) {
    const booking = await requestWorkflow.createBooking(
      auth.getUserOrFail().id,
      await request.validateUsing(createSpaceBookingRequestValidator)
    )
    return response.created({
      message: 'تم إرسال طلب الحجز',
      data: await serialize.withoutWrapping(BookingTransformer.transform(booking)),
    })
  }
  async bookings({ auth, request, serialize }: HttpContext) {
    const { page, limit } = paging(request)
    const rows = await requestWorkflow.listUserBookings(auth.getUserOrFail().id, page, limit)
    return serialize(BookingTransformer.paginate(rows.all(), rows.getMeta()))
  }
  async showBooking({ auth, params, serialize }: HttpContext) {
    return serialize(
      BookingTransformer.transform(
        await requestWorkflow.getUserBooking(auth.getUserOrFail().id, Number(params.id))
      )
    )
  }
  async cancelBooking({ auth, params, response, serialize }: HttpContext) {
    const booking = await requestWorkflow.cancelBookingByUser(
      Number(params.id),
      auth.getUserOrFail().id
    )
    return response.ok({
      data: await serialize.withoutWrapping(BookingTransformer.transform(booking)),
    })
  }
  async createInquiry({ auth, request, response }: HttpContext) {
    return response.created({
      message: 'تم إرسال استفسار الموعد',
      data: await requestWorkflow.createInquiry(
        auth.getUserOrFail().id,
        await request.validateUsing(createDateInquiryValidator)
      ),
    })
  }
  async inquiries({ auth, request, response }: HttpContext) {
    const { page, limit } = paging(request)
    const rows = await requestWorkflow.listInquiries('user', auth.getUserOrFail().id, page, limit)
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async showInquiry({ auth, params, response }: HttpContext) {
    return response.ok({
      data: await requestWorkflow.getInquiry('user', auth.getUserOrFail().id, Number(params.id)),
    })
  }
  async inquiryMessages({ auth, params, request, response }: HttpContext) {
    const { page, limit } = paging(request)
    const rows = await requestWorkflow.listInquiryMessages(
      'user',
      auth.getUserOrFail().id,
      Number(params.id),
      page,
      limit
    )
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async cancelInquiry({ auth, params, response }: HttpContext) {
    return response.ok({
      data: await requestWorkflow.cancelInquiry(auth.getUserOrFail().id, Number(params.id)),
    })
  }
  async createVisit({ auth, request, response }: HttpContext) {
    return response.created({
      message: 'تم إرسال طلب الزيارة',
      data: await requestWorkflow.createVisit(
        auth.getUserOrFail().id,
        await request.validateUsing(createVisitRequestValidator)
      ),
    })
  }
  async visits({ auth, request, response }: HttpContext) {
    const { page, limit } = paging(request)
    const rows = await requestWorkflow.listVisits('user', auth.getUserOrFail().id, page, limit)
    return response.ok({ data: rows.all(), meta: rows.getMeta() })
  }
  async showVisit({ auth, params, response }: HttpContext) {
    return response.ok({
      data: await requestWorkflow.getVisit('user', auth.getUserOrFail().id, Number(params.id)),
    })
  }
  async cancelVisit({ auth, params, response }: HttpContext) {
    return response.ok({
      data: await requestWorkflow.cancelVisit(auth.getUserOrFail().id, Number(params.id)),
    })
  }
  async acceptVisitAlternative({ auth, params, response }: HttpContext) {
    return response.ok({
      data: await requestWorkflow.acceptVisitAlternative(
        auth.getUserOrFail().id,
        Number(params.id)
      ),
    })
  }
  async rejectVisitAlternative({ auth, params, response }: HttpContext) {
    return response.ok({
      data: await requestWorkflow.rejectVisitAlternative(
        auth.getUserOrFail().id,
        Number(params.id)
      ),
    })
  }
}
