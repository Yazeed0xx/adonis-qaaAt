import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { BookingFactory } from '#database/factories/booking_factory'
import { CompanyFactory } from '#database/factories/company_factory'
import { HallFactory } from '#database/factories/hall_factory'
import { NotificationFactory } from '#database/factories/notification_factory'
import { ServiceFactory } from '#database/factories/service_factory'
import { UserFactory } from '#database/factories/user_factory'
import {
  approvedCompanyRecipe,
  pendingCompanyRecipe,
  rejectedCompanyRecipe,
} from '#database/factories/recipes'
import type Booking from '#models/booking'
import type Company from '#models/company'
import type Hall from '#models/hall'
import type Service from '#models/service'
import type User from '#models/user'
import type { DemoScenarioContext } from '#database/seeding/scenario_context'

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Khobar', 'Makkah', 'Madinah']
const BOOKING_STATES = [
  'pending',
  'accepted',
  'rejected',
  'confirmed',
  'cancelled',
  'completed',
  'expired',
] as const

const BASE_COUNTS = {
  users: 150,
  approvedCompanies: 24,
  pendingCompanies: 4,
  rejectedCompanies: 4,
  hallsPerApprovedCompany: 10,
  servicesPerApprovedCompany: 6,
  bookings: 4_000,
  notifications: 8_000,
}

type BookingState = (typeof BOOKING_STATES)[number]

export function getHeavySeedCounts(scale = readScale()) {
  return Object.fromEntries(
    Object.entries(BASE_COUNTS).map(([name, count]) => [
      name,
      Math.max(1, Math.round(count * scale)),
    ])
  ) as typeof BASE_COUNTS
}

export async function seedHeavyData(context: DemoScenarioContext) {
  const admin = context.admin
  if (!admin) throw new Error('Accounts must be seeded before heavy data')

  const counts = getHeavySeedCounts()
  const users = await createUsers(counts.users)
  const companies = await createCompanies(admin.id, counts)
  const approvedCompanies = companies.filter((company) => company.status === 'approved')
  const halls = await createHalls(approvedCompanies, counts.hallsPerApprovedCompany)
  const services = await createServices(approvedCompanies, counts.servicesPerApprovedCompany)
  const bookings = await createBookings(users, halls, counts.bookings)

  await attachServicesToBookings(bookings, halls, services)
  await createNotifications(users, companies, bookings, counts.notifications)

  return {
    users: users.length,
    companies: companies.length,
    halls: halls.length,
    services: services.length,
    bookings: bookings.length,
    notifications: counts.notifications,
  }
}

async function createUsers(count: number) {
  return inBatches(count, 25, async (offset, size) => {
    const rows = Array.from({ length: size }, (_, index) => {
      const number = offset + index + 1
      return {
        userName: `Load Test User ${number.toString().padStart(3, '0')}`,
        email: `heavy.user${number.toString().padStart(3, '0')}@qaat.test`,
        password: 'password123',
        createdAt: DateTime.now().minus({ days: number % 365, minutes: number }),
      }
    })

    return UserFactory.apply('user', 'verified').with('userProfile', 1).merge(rows).createMany(size)
  })
}

async function createCompanies(adminId: number, counts: ReturnType<typeof getHeavySeedCounts>) {
  const companies: Company[] = []
  const definitions: Array<{ state: 'approved' | 'pending' | 'rejected'; count: number }> = [
    { state: 'approved', count: counts.approvedCompanies },
    { state: 'pending', count: counts.pendingCompanies },
    { state: 'rejected', count: counts.rejectedCompanies },
  ]

  let number = 1
  for (const definition of definitions) {
    for (let index = 0; index < definition.count; index++, number++) {
      const padded = number.toString().padStart(3, '0')
      const account = {
        userName: `Load Test Company ${padded}`,
        email: `heavy.company${padded}@qaat.test`,
        password: 'password123',
        companyName: `QaaAt Load Venue Group ${padded}`,
        description: `Load-testing company ${padded} with realistic halls, services, and bookings.`,
        logo: `https://picsum.photos/seed/qaat-company-${padded}/200/200`,
        banner: `https://picsum.photos/seed/qaat-company-banner-${padded}/1200/400`,
        website: `https://company-${padded}.qaat.test`,
        socialLinks: { instagram: `@qaat_load_${padded}` },
      }

      const builder =
        definition.state === 'approved'
          ? approvedCompanyRecipe(CompanyFactory, adminId, account)
          : definition.state === 'pending'
            ? pendingCompanyRecipe(CompanyFactory, account)
            : rejectedCompanyRecipe(CompanyFactory, account)

      companies.push(
        await builder
          .merge({
            city: CITIES[(number - 1) % CITIES.length],
            registrationNumber: `LOAD-CR-${padded}`,
            registrationNumberPdf: `https://example.com/load-documents/${padded}.pdf`,
            contactPerson: `Load Contact ${padded}`,
            businessAddress: `${100 + number} Load Test Avenue`,
            rejectionReason:
              definition.state === 'rejected'
                ? 'Load-test rejection: registration documents require correction.'
                : null,
          })
          .create()
      )
    }
  }

  return companies
}

async function createHalls(companies: Company[], hallsPerCompany: number) {
  const rows = companies.flatMap((company, companyIndex) =>
    Array.from({ length: hallsPerCompany }, (_, hallIndex) => {
      const number = companyIndex * hallsPerCompany + hallIndex + 1
      return {
        companyId: company.id,
        name: `Load Test Hall ${number.toString().padStart(4, '0')}`,
        city: company.city,
        location: `${company.city} Event District ${(hallIndex % 5) + 1}`,
        address: `${200 + number} Venue Street`,
        capacity: 80 + ((number * 37) % 920),
        pricing: (2_000 + ((number * 173) % 18_000)).toString(),
        isAvailable: number % 9 !== 0,
        images: [
          `https://picsum.photos/seed/qaat-hall-${number}-a/800/600`,
          `https://picsum.photos/seed/qaat-hall-${number}-b/800/600`,
        ],
        amenities: {
          parking: true,
          wifi: number % 4 !== 0,
          catering: number % 3 !== 0,
          sound_system: number % 5 !== 0,
          accessibility: number % 2 === 0,
        },
        services: ['parking', 'setup and cleanup', 'guest reception'],
        createdAt: DateTime.now().minus({ days: number % 540, minutes: number }),
      }
    })
  )

  return createFactoryRows<Hall>(HallFactory, rows, 100)
}

async function createServices(companies: Company[], servicesPerCompany: number) {
  const names = ['Decoration', 'Photography', 'Catering', 'Live Music', 'Valet', 'Event Staff']
  const rows = companies.flatMap((company, companyIndex) =>
    Array.from({ length: servicesPerCompany }, (_, serviceIndex) => {
      const number = companyIndex * servicesPerCompany + serviceIndex + 1
      return {
        companyId: company.id,
        name: `${names[serviceIndex % names.length]} Package ${number}`,
        description: `Load-test add-on package ${number} for high-volume booking scenarios.`,
        price: (500 + ((number * 211) % 9_500)).toString(),
        isActive: number % 11 !== 0,
      }
    })
  )

  return createFactoryRows<Service>(ServiceFactory, rows, 100)
}

async function createBookings(users: User[], halls: Hall[], count: number) {
  const bookings: Booking[] = []

  for (const state of BOOKING_STATES) {
    const stateIndex = BOOKING_STATES.indexOf(state)
    const stateCount = Math.floor(count / BOOKING_STATES.length) + (stateIndex < count % 7 ? 1 : 0)
    const rows = Array.from({ length: stateCount }, (_, index) => {
      const globalIndex = stateIndex + index * BOOKING_STATES.length
      const hall = halls[globalIndex % halls.length]
      const dayOffset = state === 'completed' ? -(1 + (globalIndex % 365)) : 1 + (globalIndex % 240)

      return {
        userId: users[globalIndex % users.length].id,
        hallId: hall.id,
        bookingDate: DateTime.now().plus({ days: dayOffset }),
        startTime: `${14 + (globalIndex % 6)}:00`,
        endTime: `${18 + (globalIndex % 6)}:00`,
        totalPrice: (Number(hall.pricing) * (1 + (globalIndex % 4))).toFixed(2),
        specialRequests:
          globalIndex % 5 === 0
            ? `Load-test request ${globalIndex + 1}: accessibility and guest reception required.`
            : null,
        createdAt: DateTime.now().minus({ days: globalIndex % 365, minutes: globalIndex }),
      }
    })

    bookings.push(...(await createStateBookings(state, rows)))
  }

  return bookings
}

async function createStateBookings(state: BookingState, rows: Record<string, any>[]) {
  const bookings: Booking[] = []
  for (let offset = 0; offset < rows.length; offset += 250) {
    const chunk = rows.slice(offset, offset + 250)
    bookings.push(...(await BookingFactory.apply(state).merge(chunk).createMany(chunk.length)))
  }
  return bookings
}

async function attachServicesToBookings(bookings: Booking[], halls: Hall[], services: Service[]) {
  const companyByHall = new Map(halls.map((hall) => [hall.id, hall.companyId]))
  const servicesByCompany = Map.groupBy(services, (service) => service.companyId)
  const now = DateTime.now().toSQL()
  const rows = bookings.flatMap((booking, index) => {
    if (index % 3 === 0) return []
    const companyServices = servicesByCompany.get(companyByHall.get(booking.hallId!)!) ?? []
    return companyServices.slice(0, index % 4 === 0 ? 2 : 1).map((service) => ({
      booking_id: booking.id,
      service_id: service.id,
      price_at_booking: service.price,
      created_at: now,
      updated_at: now,
    }))
  })

  for (let offset = 0; offset < rows.length; offset += 1_000) {
    await db.table('booking_services').multiInsert(rows.slice(offset, offset + 1_000))
  }
}

async function createNotifications(
  users: User[],
  companies: Company[],
  bookings: Booking[],
  count: number
) {
  const recipients = [...users, ...companies.map((company) => ({ id: company.userId }) as User)]
  const rows = Array.from({ length: count }, (_, index) => {
    const booking = bookings[index % bookings.length]
    const state = booking.status
    return {
      userId: recipients[index % recipients.length].id,
      type: state === 'pending' ? 'new_booking_request' : `booking_${state}`,
      title: notificationTitle(state),
      message: `Load-test notification ${index + 1} for booking #${booking.id}.`,
      data: { bookingId: booking.id, hallId: booking.hallId, status: state },
      readAt: index % 3 === 0 ? DateTime.now().minus({ days: index % 90 }) : null,
      createdAt: DateTime.now().minus({ days: index % 180, minutes: index }),
    }
  })

  await createFactoryRows(NotificationFactory, rows, 500)
}

function notificationTitle(state: string) {
  return `Booking ${state.charAt(0).toUpperCase()}${state.slice(1)}`
}

async function createFactoryRows<T>(factory: any, rows: Record<string, any>[], batchSize: number) {
  const records: T[] = []
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const chunk = rows.slice(offset, offset + batchSize)
    records.push(...(await factory.merge(chunk).createMany(chunk.length)))
  }
  return records
}

async function inBatches<T>(
  count: number,
  batchSize: number,
  callback: (offset: number, size: number) => Promise<T[]>
) {
  const records: T[] = []
  for (let offset = 0; offset < count; offset += batchSize) {
    records.push(...(await callback(offset, Math.min(batchSize, count - offset))))
  }
  return records
}

function readScale() {
  const value = Number(process.env.SEED_SCALE ?? '1')
  if (!Number.isFinite(value) || value <= 0 || value > 10) {
    throw new Error('SEED_SCALE must be a number greater than 0 and no more than 10')
  }
  return value
}
