import { inject } from '@adonisjs/core'
import { BookingManagementService } from '#services/booking_management_service'
import { CompanyCalendarService } from '#services/company_calendar_service'
import { RequestWorkflowService } from '#services/request_workflow_service'
import { PricingQuoteService } from '#services/pricing_quote_service'

export interface ScheduledMaintenanceResult {
  bookings: number
  externalHolds: number
  requests: number
  quotes: number
}

@inject()
export class ScheduledMaintenanceService {
  constructor(
    private bookings: BookingManagementService,
    private calendar: CompanyCalendarService,
    private requests: RequestWorkflowService,
    private quotes: PricingQuoteService
  ) {}

  async run(): Promise<ScheduledMaintenanceResult> {
    return {
      bookings: await this.bookings.expireOldBookings(),
      externalHolds: await this.calendar.expireExternalHolds(),
      requests: await this.requests.expirePending(),
      quotes: await this.quotes.expire(),
    }
  }
}
