import type { HttpContext } from '@adonisjs/core/http'
import availability from '#services/availability_service'

export default class PublicAvailabilityController {
  async show({ params, request, response }: HttpContext) {
    const durationMinutes = request.input('durationMinutes')
    const durationDays = request.input('durationDays')
    return response.ok({
      data: await availability.publicAvailability(
        Number(params.id),
        request.input('from'),
        request.input('to'),
        {
          durationMinutes: durationMinutes === undefined ? undefined : Number(durationMinutes),
          durationDays: durationDays === undefined ? undefined : Number(durationDays),
        }
      ),
    })
  }
}
