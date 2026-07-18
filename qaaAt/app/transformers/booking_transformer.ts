import { BaseTransformer } from '@adonisjs/core/transformers'
import type Booking from '#models/booking'
import { canonicalMajorAmount, numericMajorAmount } from '#lib/money'
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
      totalPrice:
        this.resource.totalPrice === null ? null : numericMajorAmount(this.resource.totalPrice),
      totalPriceDecimal:
        this.resource.totalPrice === null ? null : canonicalMajorAmount(this.resource.totalPrice),
      totalPriceMinor:
        this.resource.acceptedTotalMinor === null ? null : String(this.resource.acceptedTotalMinor),
      requestReference: this.resource.requestReference,
      companyId: this.resource.companyId,
      venueId: this.resource.venueId,
      spaceId: this.resource.spaceId,
      spaceNameSnapshot: {
        ar: this.resource.spaceNameSnapshotAr,
        en: this.resource.spaceNameSnapshotEn,
      },
      venueNameSnapshot: {
        ar: this.resource.venueNameSnapshotAr,
        en: this.resource.venueNameSnapshotEn,
      },
      categorySlugSnapshot: this.resource.categorySlugSnapshot,
      eventType: this.resource.eventType,
      attendance: this.resource.attendance,
      contactPreference: this.resource.contactPreference,
      startsAt: this.resource.startsAt,
      endsAt: this.resource.endsAt,
      timezone: this.resource.originalTimezone,
      responseExpiresAt: this.resource.responseExpiresAt,
      lockVersion: this.resource.lockVersion,
      isExpired: this.resource.isExpired,
      user: UserTransformer.transform(this.whenLoaded(this.resource.user)),
    }
  }

  forAdminView() {
    return {
      ...this.toObject(),
      deletedAt: this.resource.deletedAt,
      userId: this.resource.userId,
      user: UserTransformer.transform(this.whenLoaded(this.resource.user))?.useVariant(
        'forAdminView'
      ),
    }
  }
}
