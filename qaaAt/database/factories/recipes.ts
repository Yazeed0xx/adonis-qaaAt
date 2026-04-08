import { DateTime } from 'luxon'
import type Service from '#models/service'
import type { CompanyFactory } from '#database/factories/company_factory'
import { BookingFactory } from '#database/factories/booking_factory'

type CompanyBuilder = ReturnType<typeof CompanyFactory.query>

interface CompanyAccountRecipe {
  userName: string
  email: string
  password?: string
  companyName: string
  description?: string
  logo?: string
  banner?: string
  website?: string
  socialLinks?: Record<string, any> | null
}

export function approvedCompanyRecipe(
  builder: CompanyBuilder,
  adminId: number,
  recipe: CompanyAccountRecipe
) {
  return builder
    .apply('approved')
    .with('user', 1, (user) => {
      user.apply('company', 'verified').merge({
        userName: recipe.userName,
        email: recipe.email,
        password: recipe.password ?? 'password123',
      })
    })
    .with('companyProfile', 1, (profile) => {
      profile.merge({
        companyName: recipe.companyName,
        description: recipe.description,
        logo: recipe.logo,
        banner: recipe.banner,
        website: recipe.website,
        socialLinks: recipe.socialLinks ?? null,
      })
    })
    .merge({
      approvedAt: DateTime.now().minus({ days: 7 }),
      approvedBy: adminId,
    })
}

interface BookingWithServicesInput {
  serviceRecords?: Service[]
  bookingData: Record<string, any>
  states: Array<
    'pending' | 'accepted' | 'rejected' | 'confirmed' | 'cancelled' | 'completed' | 'expired'
  >
}

export async function createBookingWithServices(input: BookingWithServicesInput) {
  const booking = await BookingFactory.apply(...input.states).merge(input.bookingData).create()

  if (input.serviceRecords?.length) {
    await booking.related('services').attach(
      Object.fromEntries(
        input.serviceRecords.map((service) => [service.id, { price_at_booking: service.price }])
      )
    )
  }

  return booking
}

export function pendingCompanyRecipe(builder: CompanyBuilder, recipe: CompanyAccountRecipe) {
  return builder
    .apply('pending')
    .with('user', 1, (user) => {
      user.apply('company', 'verified').merge({
        userName: recipe.userName,
        email: recipe.email,
        password: recipe.password ?? 'password123',
      })
    })
    .with('companyProfile', 1, (profile) => {
      profile.merge({
        companyName: recipe.companyName,
        description: recipe.description,
      })
    })
}

export function rejectedCompanyRecipe(builder: CompanyBuilder, recipe: CompanyAccountRecipe) {
  return builder
    .apply('rejected')
    .with('user', 1, (user) => {
      user.apply('company', 'verified').merge({
        userName: recipe.userName,
        email: recipe.email,
        password: recipe.password ?? 'password123',
      })
    })
    .with('companyProfile', 1, (profile) => {
      profile.merge({
        companyName: recipe.companyName,
      })
    })
}
