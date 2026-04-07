import { DateTime } from 'luxon'
import Booking from '#models/booking'
import Hall from '#models/hall'
import Service from '#models/service'
import notificationService from '#services/notification_service'

interface CreateBookingData {
  hallId: number
  bookingDate: DateTime
  startTime: string
  endTime: string
  serviceIds?: number[]
  specialRequests?: string
}

interface TimeSlot {
  startTime: string
  endTime: string
  isAvailable: boolean
}

export class BookingManagementService {
  private static EXPIRY_DAYS = 7

  private fromDatabaseAmount(value: string) {
    return Number(value)
  }

  private toDatabaseAmount(value: number) {
    return String(value)
  }

  /**
   * Create a new booking request
   */
  async createBooking(userId: number, data: CreateBookingData): Promise<Booking> {
    // Validate booking date is not in the past
    const today = DateTime.now().startOf('day')
    if (data.bookingDate < today) {
      throw new Error('Booking date must be today or in the future')
    }

    // Validate endTime > startTime
    if (data.endTime <= data.startTime) {
      throw new Error('End time must be after start time')
    }

    // Check if hall exists and is available
    const hall = await Hall.query()
      .where('id', data.hallId)
      .whereNull('deletedAt')
      .preload('company', (query) => query.preload('user'))
      .first()

    if (!hall) {
      throw new Error('Hall not found')
    }

    if (!hall.isAvailable) {
      throw new Error('Hall is not available for booking')
    }

    // Check if the time slot is available
    const isAvailable = await this.checkTimeSlotAvailable(
      data.hallId,
      data.bookingDate,
      data.startTime,
      data.endTime
    )

    if (!isAvailable) {
      throw new Error('The selected time slot is not available')
    }

    // Calculate total price
    const totalPrice = await this.calculateTotalPrice(
      hall,
      data.startTime,
      data.endTime,
      data.serviceIds
    )

    // Create the booking
    const booking = await Booking.create({
      userId,
      hallId: data.hallId,
      bookingDate: data.bookingDate,
      startTime: data.startTime,
      endTime: data.endTime,
      totalPrice: this.toDatabaseAmount(totalPrice),
      specialRequests: data.specialRequests || null,
      status: 'pending',
      paymentStatus: 'unpaid',
      expiresAt: DateTime.now().plus({ days: BookingManagementService.EXPIRY_DAYS }),
    })

    // Attach services if provided
    if (data.serviceIds && data.serviceIds.length > 0) {
      const services = await Service.query()
        .whereIn('id', data.serviceIds)
        .where('companyId', hall.companyId)
      if (services.length !== data.serviceIds.length) {
        throw new Error('One or more selected services are not available for this hall')
      }
      const pivotData: Record<number, { price_at_booking: string }> = {}
      services.forEach((service) => {
        pivotData[service.id] = { price_at_booking: service.price }
      })
      await booking.related('services').attach(pivotData)
    }

    // Notify company of new booking request
    if (hall.company?.user) {
      await notificationService.notifyNewBookingRequest(
        hall.company.user.id,
        'A customer', // We don't expose user name to company before acceptance
        hall.name,
        data.bookingDate.toFormat('yyyy-MM-dd'),
        booking.id
      )
    }

    return booking
  }

  /**
   * Check if a time slot is available for a hall
   */
  async checkTimeSlotAvailable(
    hallId: number,
    bookingDate: DateTime,
    startTime: string,
    endTime: string,
    excludeBookingId?: number
  ): Promise<boolean> {
    const query = Booking.query()
      .where('hallId', hallId)
      .where('bookingDate', bookingDate.toFormat('yyyy-MM-dd'))
      .whereIn('status', ['pending', 'accepted', 'confirmed']) // Only check non-cancelled bookings
      .where((builder) => {
        // Check for overlapping time slots
        builder.where((q) => {
          q.where('startTime', '<', endTime).where('endTime', '>', startTime)
        })
      })

    if (excludeBookingId) {
      query.whereNot('id', excludeBookingId)
    }

    const conflictingBookings = await query.first()

    return !conflictingBookings
  }

  /**
   * Get available time slots for a hall on a specific date
   */
  async getAvailability(hallId: number, date: DateTime): Promise<TimeSlot[]> {
    // Define available hours (e.g., 8 AM to 10 PM)
    const startHour = 8
    const endHour = 22
    const slotDurationHours = 2

    const slots: TimeSlot[] = []

    for (let hour = startHour; hour < endHour; hour += slotDurationHours) {
      const startTime = `${hour.toString().padStart(2, '0')}:00`
      const endTime = `${(hour + slotDurationHours).toString().padStart(2, '0')}:00`

      const isAvailable = await this.checkTimeSlotAvailable(hallId, date, startTime, endTime)

      slots.push({
        startTime,
        endTime,
        isAvailable,
      })
    }

    return slots
  }

  /**
   * Calculate total price for a booking
   */
  async calculateTotalPrice(
    hall: Hall,
    startTime: string,
    endTime: string,
    serviceIds?: number[]
  ): Promise<number> {
    // Calculate hours (accounting for minutes)
    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)
    const hours = (endHour * 60 + endMin - (startHour * 60 + startMin)) / 60

    // Hall price (pricing is per hour)
    let totalPrice = this.fromDatabaseAmount(hall.pricing) * hours

    // Add service prices
    if (serviceIds && serviceIds.length > 0) {
      const services = await Service.query().whereIn('id', serviceIds)
      totalPrice += services.reduce(
        (sum, service) => sum + this.fromDatabaseAmount(service.price),
        0
      )
    }

    return totalPrice
  }

  /**
   * Accept a booking (company action)
   */
  async acceptBooking(bookingId: number, companyId: number): Promise<Booking> {
    const booking = await Booking.query()
      .where('id', bookingId)
      .preload('hall', (query) => query.preload('company'))
      .preload('user')
      .first()

    if (!booking) {
      throw new Error('Booking not found')
    }

    if (booking.hall.companyId !== companyId) {
      throw new Error('Unauthorized: This booking does not belong to your company')
    }

    if (booking.status !== 'pending') {
      throw new Error(`Cannot accept booking with status: ${booking.status}`)
    }

    if (booking.isExpired) {
      throw new Error('Cannot accept expired booking')
    }

    booking.status = 'accepted'
    booking.companyRespondedAt = DateTime.now()
    // Set payment due date (e.g., 3 days from acceptance)
    booking.paymentDueDate = DateTime.now().plus({ days: 3 })
    await booking.save()

    // Notify user
    await notificationService.notifyBookingAccepted(
      booking.userId,
      booking.hall.name,
      booking.bookingDate.toFormat('yyyy-MM-dd'),
      booking.id
    )

    return booking
  }

  /**
   * Reject a booking (company action)
   */
  async rejectBooking(bookingId: number, companyId: number, reason: string): Promise<Booking> {
    const booking = await Booking.query()
      .where('id', bookingId)
      .preload('hall', (query) => query.preload('company'))
      .preload('user')
      .first()

    if (!booking) {
      throw new Error('Booking not found')
    }

    if (booking.hall.companyId !== companyId) {
      throw new Error('Unauthorized: This booking does not belong to your company')
    }

    if (booking.status !== 'pending') {
      throw new Error(`Cannot reject booking with status: ${booking.status}`)
    }

    booking.status = 'rejected'
    booking.rejectionReason = reason
    booking.companyRespondedAt = DateTime.now()
    await booking.save()

    // Notify user
    await notificationService.notifyBookingRejected(
      booking.userId,
      booking.hall.name,
      booking.bookingDate.toFormat('yyyy-MM-dd'),
      reason,
      booking.id
    )

    return booking
  }

  /**
   * Cancel a booking (user action)
   */
  async cancelBooking(bookingId: number, userId: number): Promise<Booking> {
    const booking = await Booking.query()
      .where('id', bookingId)
      .where('userId', userId)
      .preload('hall')
      .first()

    if (!booking) {
      throw new Error('Booking not found')
    }

    if (!['pending', 'accepted'].includes(booking.status)) {
      throw new Error(`Cannot cancel booking with status: ${booking.status}`)
    }

    booking.status = 'cancelled'
    await booking.save()

    return booking
  }

  /**
   * Get user's bookings
   */
  async getUserBookings(userId: number, page: number = 1, limit: number = 20, status?: string) {
    const query = Booking.query()
      .where('userId', userId)
      .whereNull('deletedAt')
      .preload('hall', (q) => q.preload('company', (cq) => cq.preload('companyProfile')))
      .preload('services')
      .orderBy('createdAt', 'desc')

    if (status) {
      query.where('status', status)
    }

    return query.paginate(page, limit)
  }

  /**
   * Get company's bookings (for all halls)
   */
  async getCompanyBookings(
    companyId: number,
    page: number = 1,
    limit: number = 20,
    status?: string
  ) {
    const query = Booking.query()
      .whereHas('hall', (hallQuery) => {
        hallQuery.where('companyId', companyId)
      })
      .whereNull('deletedAt')
      .preload('hall')
      .preload('user')
      .preload('services')
      .orderBy('createdAt', 'desc')

    if (status) {
      query.where('status', status)
    }

    return query.paginate(page, limit)
  }

  /**
   * Get pending bookings for a company (needs response)
   */
  async getPendingCompanyBookings(companyId: number, page: number = 1, limit: number = 20) {
    return Booking.query()
      .where('status', 'pending')
      .where('expiresAt', '>', DateTime.now().toSQL())
      .whereHas('hall', (hallQuery) => {
        hallQuery.where('companyId', companyId)
      })
      .preload('hall')
      .preload('user')
      .preload('services')
      .orderBy('createdAt', 'asc') // Oldest first (needs response)
      .paginate(page, limit)
  }

  /**
   * Expire old pending bookings (to be called by cron job)
   */
  async expireOldBookings(): Promise<number> {
    const expiredBookings = await Booking.query()
      .where('status', 'pending')
      .where('expiresAt', '<', DateTime.now().toSQL())
      .preload('hall')

    let count = 0
    for (const booking of expiredBookings) {
      booking.status = 'expired'
      await booking.save()

      // Notify user
      await notificationService.notifyBookingExpired(
        booking.userId,
        booking.hall.name,
        booking.bookingDate.toFormat('yyyy-MM-dd'),
        booking.id
      )

      count++
    }

    return count
  }
}

export default new BookingManagementService()
