import type Booking from '#models/booking'
import type Company from '#models/company'
import type Hall from '#models/hall'
import type Service from '#models/service'
import type User from '#models/user'

export interface DemoScenarioContext {
  admin?: User
  users: {
    mohammed?: User
    sara?: User
    ahmed?: User
    fatima?: User
  }
  companies: {
    royal?: Company
    golden?: Company
    star?: Company
    quick?: Company
  }
  halls: {
    royalGrand?: Hall
    royalGarden?: Hall
    royalConference?: Hall
    goldenBallroom?: Hall
    pearlHall?: Hall
    sunsetTerrace?: Hall
  }
  services: {
    royalDecoration?: Service
    royalPhotography?: Service
    royalVideo?: Service
    royalCateringStandard?: Service
    royalCateringPremium?: Service
    goldenDecoration?: Service
    goldenPhotoVideo?: Service
    goldenLiveMusic?: Service
  }
  bookings: {
    pending?: Booking
    accepted?: Booking
    confirmed?: Booking
  }
}

export function createScenarioContext(): DemoScenarioContext {
  return {
    users: {},
    companies: {},
    halls: {},
    services: {},
    bookings: {},
  }
}
