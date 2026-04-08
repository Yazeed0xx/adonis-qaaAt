import { BaseTransformer } from '@adonisjs/core/transformers'
import type Booking from '#models/booking'
import { fromDatabaseAmount } from '#lib/money'
import HallTransformer from '#transformers/hall_transformer'
import ServiceTransformer from '#transformers/service_transformer'
import UserTransformer from '#transformers/user_transformer'

export default class BookingTransformer extends BaseTransformer<Booking> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'bookingDate',
        'startTime',
        'endTime',
        'status',
        'specialRequests',
        'rejectionReason',
        'companyRespondedAt',
        'expiresAt',
        'paymentStatus',
        'paymentDueDate',
        'createdAt',
        'updatedAt',
      ]),
      totalPrice: fromDatabaseAmount(this.resource.totalPrice),
      isExpired: this.resource.isExpired,
      hall: HallTransformer.transform(this.whenLoaded(this.resource.hall)),
      user: UserTransformer.transform(this.whenLoaded(this.resource.user)),
      services: ServiceTransformer.transform(this.whenLoaded(this.resource.services)),
    }
  }

  forAdminView() {
    const hall = this.whenLoaded(this.resource.hall)
    const user = this.whenLoaded(this.resource.user)
    const services = this.whenLoaded(this.resource.services)

    return {
      ...this.toObject(),
      deletedAt: this.resource.deletedAt,
      userId: this.resource.userId,
      hallId: this.resource.hallId,
      hall: hall ? HallTransformer.transform(hall)!.useVariant('forAdminView') : undefined,
      user: user ? UserTransformer.transform(user)!.useVariant('forAdminView') : undefined,
      services: services
        ? ServiceTransformer.transform(services)!.useVariant('forAdminView')
        : undefined,
    }
  }
}
