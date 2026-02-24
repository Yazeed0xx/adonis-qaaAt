import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import User from '#models/user'
import UserProfile from '#models/user_profile'
import Company from '#models/company'
import CompanyProfile from '#models/company_profile'
import Hall from '#models/hall'
import Service from '#models/service'
import Booking from '#models/booking'
import Notification from '#models/notification'

export default class MainSeeder extends BaseSeeder {
  async run() {
    console.log('Clearing existing data...')
    const { default: db } = await import('@adonisjs/lucid/services/db')
    await db.rawQuery(
      'TRUNCATE TABLE notifications, booking_services, bookings, services, halls, company_profiles, companies, user_profiles, auth_access_tokens, users RESTART IDENTITY CASCADE'
    )

    console.log('Seeding database with test data...')

    // ==================== ADMIN USER ====================
    console.log('Creating admin user...')
    const admin = await User.create({
      userName: 'Admin',
      email: 'admin@qaat.app',
      password: 'admin123',
      userType: 'admin',
      emailVerifiedAt: DateTime.now(),
    })
    console.log(`  Admin: admin@qaat.app / admin123`)

    // ==================== REGULAR USERS ====================
    console.log('Creating regular users...')
    const users = await User.createMany([
      {
        userName: 'Mohammed Ahmed',
        email: 'mohammed@example.com',
        password: 'password123',
        userType: 'user',
        emailVerifiedAt: DateTime.now(),
      },
      {
        userName: 'Sara Al-Rashid',
        email: 'sara@example.com',
        password: 'password123',
        userType: 'user',
        emailVerifiedAt: DateTime.now(),
      },
      {
        userName: 'Ahmed Hassan',
        email: 'ahmed@example.com',
        password: 'password123',
        userType: 'user',
        emailVerifiedAt: DateTime.now(),
      },
      {
        userName: 'Fatima Al-Saud',
        email: 'fatima@example.com',
        password: 'password123',
        userType: 'user',
        emailVerifiedAt: null, // Unverified user
        emailVerificationToken: 'test-verification-token-123',
        emailVerificationExpiresAt: DateTime.now().plus({ days: 1 }),
      },
    ])

    // Create user profiles
    await UserProfile.createMany([
      {
        userId: users[0].id,
        firstName: 'Mohammed',
        lastName: 'Ahmed',
        phone: '+966501234567',
        address: 'Riyadh, Al Olaya',
      },
      {
        userId: users[1].id,
        firstName: 'Sara',
        lastName: 'Al-Rashid',
        phone: '+966507654321',
        address: 'Jeddah, Al Hamra',
      },
      {
        userId: users[2].id,
        firstName: 'Ahmed',
        lastName: 'Hassan',
        phone: '+966509876543',
        address: 'Dammam, Al Faisaliah',
      },
      {
        userId: users[3].id,
        firstName: 'Fatima',
        lastName: 'Al-Saud',
        phone: '+966502345678',
        address: 'Riyadh, Al Malaz',
      },
    ])

    console.log(`  Users created: ${users.map((u) => u.email).join(', ')}`)
    console.log(`  Password for all: password123`)
    console.log(`  Unverified user: fatima@example.com`)

    // ==================== COMPANIES ====================
    console.log('Creating companies...')

    // Approved Companies
    const companyUser1 = await User.create({
      userName: 'Royal Events',
      email: 'royal@example.com',
      password: 'password123',
      userType: 'company',
    })
    const company1 = await Company.create({
      userId: companyUser1.id,
      taxId: '300123456789',
      registrationNumber: 'CR-1234567890',
      registrationNumberPdf: 'https://example.com/docs/royal-cr.pdf',
      contactPerson: 'Khalid Al-Mansour',
      businessAddress: '123 King Fahd Road, Al Olaya District',
      city: 'Riyadh',
      status: 'approved',
      approvedAt: DateTime.now().minus({ days: 30 }),
      approvedBy: admin.id,
    })
    await CompanyProfile.create({
      userId: companyUser1.id,
      companyName: 'Royal Events Co.',
      description:
        'Premium wedding and event venues in Riyadh. We specialize in luxury celebrations.',
      logo: 'https://picsum.photos/seed/royal/200/200',
      banner: 'https://picsum.photos/seed/royalbanner/1200/400',
      website: 'https://royalevents.sa',
      socialLinks: { instagram: '@royalevents', twitter: '@royalevents_sa' },
    })

    const companyUser2 = await User.create({
      userName: 'Golden Palace',
      email: 'golden@example.com',
      password: 'password123',
      userType: 'company',
    })
    const company2 = await Company.create({
      userId: companyUser2.id,
      taxId: '300987654321',
      registrationNumber: 'CR-0987654321',
      registrationNumberPdf: 'https://example.com/docs/golden-cr.pdf',
      contactPerson: 'Nora Al-Faisal',
      businessAddress: '456 Prince Sultan Street',
      city: 'Jeddah',
      status: 'approved',
      approvedAt: DateTime.now().minus({ days: 15 }),
      approvedBy: admin.id,
    })
    await CompanyProfile.create({
      userId: companyUser2.id,
      companyName: 'Golden Palace Events',
      description: 'Elegant venues for weddings, conferences, and special occasions in Jeddah.',
      logo: 'https://picsum.photos/seed/golden/200/200',
      banner: 'https://picsum.photos/seed/goldenbanner/1200/400',
      website: 'https://goldenpalace.sa',
      socialLinks: { instagram: '@goldenpalace' },
    })

    // Pending Company
    const companyUser3 = await User.create({
      userName: 'Star Events',
      email: 'star@example.com',
      password: 'password123',
      userType: 'company',
    })
    await Company.create({
      userId: companyUser3.id,
      registrationNumber: 'CR-5555555555',
      registrationNumberPdf: 'https://example.com/docs/star-cr.pdf',
      contactPerson: 'Omar Al-Harbi',
      businessAddress: '789 Corniche Road',
      city: 'Dammam',
      status: 'pending',
    })
    await CompanyProfile.create({
      userId: companyUser3.id,
      companyName: 'Star Events',
      description: 'New event management company in Dammam.',
    })

    // Rejected Company
    const companyUser4 = await User.create({
      userName: 'Quick Events',
      email: 'quick@example.com',
      password: 'password123',
      userType: 'company',
    })
    await Company.create({
      userId: companyUser4.id,
      registrationNumber: 'CR-9999999999',
      registrationNumberPdf: 'https://example.com/docs/quick-cr.pdf',
      businessAddress: '321 Tahlia Street',
      city: 'Riyadh',
      status: 'rejected',
      rejectionReason:
        'Incomplete business documentation. Please provide valid commercial registration.',
      rejectedAt: DateTime.now().minus({ days: 5 }),
    })
    await CompanyProfile.create({
      userId: companyUser4.id,
      companyName: 'Quick Events',
    })

    console.log(`  Approved companies: royal@example.com, golden@example.com`)
    console.log(`  Pending company: star@example.com`)
    console.log(`  Rejected company: quick@example.com`)
    console.log(`  Password for all: password123`)

    // ==================== HALLS ====================
    console.log('Creating halls...')

    const halls = await Hall.createMany([
      // Royal Events halls
      {
        companyId: company1.id,
        name: 'Royal Grand Hall',
        description:
          'Our flagship venue featuring stunning crystal chandeliers, marble floors, and capacity for 500 guests. Perfect for grand weddings and large celebrations.',
        capacity: 500,
        location: 'Al Olaya District',
        pricing: 5000,
        images: [
          'https://picsum.photos/seed/hall1a/800/600',
          'https://picsum.photos/seed/hall1b/800/600',
          'https://picsum.photos/seed/hall1c/800/600',
        ],
        address: '123 King Fahd Road',
        city: 'Riyadh',
        amenities: {
          parking: true,
          wifi: true,
          catering: true,
          sound_system: true,
          stage: true,
          bridal_suite: true,
        },
        services: [
          'free valet parking',
          'complimentary sweets & coffee',
          'setup & cleanup',
          'bridal suite access',
        ],
        isAvailable: true,
      },
      {
        companyId: company1.id,
        name: 'Royal Garden',
        description:
          'Beautiful outdoor venue with landscaped gardens. Ideal for intimate gatherings and garden parties.',
        capacity: 150,
        location: 'Al Olaya District',
        pricing: 2500,
        images: [
          'https://picsum.photos/seed/hall2a/800/600',
          'https://picsum.photos/seed/hall2b/800/600',
        ],
        address: '123 King Fahd Road',
        city: 'Riyadh',
        amenities: { parking: true, wifi: true, outdoor_area: true },
        services: ['free parking', 'complimentary tea & coffee'],
        isAvailable: true,
      },
      {
        companyId: company1.id,
        name: 'Royal Conference Center',
        description:
          'Modern conference facility with state-of-the-art AV equipment. Perfect for business meetings and corporate events.',
        capacity: 200,
        location: 'Al Olaya District',
        pricing: 3000,
        images: ['https://picsum.photos/seed/hall3a/800/600'],
        address: '123 King Fahd Road',
        city: 'Riyadh',
        amenities: { parking: true, wifi: true, projector: true, video_conferencing: true },
        services: ['free parking', 'complimentary water & coffee', 'technical support'],
        isAvailable: true,
      },
      // Golden Palace halls
      {
        companyId: company2.id,
        name: 'Golden Ballroom',
        description:
          'Luxurious ballroom with golden accents and panoramic city views. The premier venue for high-end events in Jeddah.',
        capacity: 400,
        location: 'Al Hamra District',
        pricing: 4500,
        images: [
          'https://picsum.photos/seed/hall4a/800/600',
          'https://picsum.photos/seed/hall4b/800/600',
        ],
        address: '456 Prince Sultan Street',
        city: 'Jeddah',
        amenities: {
          parking: true,
          wifi: true,
          catering: true,
          sound_system: true,
          sea_view: true,
        },
        services: [
          'free valet parking',
          'complimentary dinner buffet',
          'free sweets & Arabic coffee',
          'setup & cleanup',
        ],
        isAvailable: true,
      },
      {
        companyId: company2.id,
        name: 'Pearl Hall',
        description:
          'Elegant medium-sized hall with modern amenities. Great for graduation parties and corporate events.',
        capacity: 250,
        location: 'Al Hamra District',
        pricing: 3500,
        images: ['https://picsum.photos/seed/hall5a/800/600'],
        address: '456 Prince Sultan Street',
        city: 'Jeddah',
        amenities: { parking: true, wifi: true, catering: true },
        services: ['free parking', 'complimentary sweets & coffee'],
        isAvailable: true,
      },
      {
        companyId: company2.id,
        name: 'Sunset Terrace',
        description:
          'Rooftop venue with breathtaking sunset views over the Red Sea. Currently under renovation.',
        capacity: 100,
        location: 'Al Hamra District',
        pricing: 2000,
        images: ['https://picsum.photos/seed/hall6a/800/600'],
        address: '456 Prince Sultan Street',
        city: 'Jeddah',
        amenities: { outdoor_area: true, sea_view: true },
        services: ['free parking'],
        isAvailable: false, // Unavailable
      },
    ])

    console.log(`  Created ${halls.length} halls`)

    // ==================== SERVICES ====================
    console.log('Creating services...')

    const services = await Service.createMany([
      {
        companyId: company1.id,
        name: 'Premium Decoration',
        description: 'Luxury floral arrangements and themed decorations',
        price: 5000,
        isActive: true,
      },
      {
        companyId: company1.id,
        name: 'Photography Package',
        description: 'Professional photography with 500+ edited photos',
        price: 4000,
        isActive: true,
      },
      {
        companyId: company1.id,
        name: 'Video Coverage',
        description: 'Full HD video coverage with drone shots',
        price: 3500,
        isActive: true,
      },
      {
        companyId: company1.id,
        name: 'Catering - Standard',
        description: 'Buffet for up to 200 guests',
        price: 8000,
        isActive: true,
      },
      {
        companyId: company1.id,
        name: 'Catering - Premium',
        description: 'Gourmet buffet for up to 200 guests',
        price: 15000,
        isActive: true,
      },
      {
        companyId: company2.id,
        name: 'Decoration Package',
        description: 'Beautiful floral and lighting arrangements',
        price: 4000,
        isActive: true,
      },
      {
        companyId: company2.id,
        name: 'Photo & Video Bundle',
        description: 'Complete media coverage package',
        price: 6000,
        isActive: true,
      },
      {
        companyId: company2.id,
        name: 'Live Music',
        description: 'Traditional Arabic music ensemble',
        price: 5000,
        isActive: true,
      },
    ])

    console.log(`  Created ${services.length} services`)

    // ==================== BOOKINGS ====================
    console.log('Creating bookings...')

    // Pending booking (waiting for company response)
    const booking1 = await Booking.create({
      userId: users[0].id,
      hallId: halls[0].id,
      bookingDate: DateTime.now().plus({ days: 45 }),
      startTime: '18:00',
      endTime: '23:00',
      status: 'pending',
      totalPrice: 25000,
      paymentStatus: 'unpaid',
      specialRequests: 'Please arrange for valet parking and extra seating near the stage.',
      expiresAt: DateTime.now().plus({ days: 7 }),
    })
    await booking1.related('services').attach({
      [services[0].id]: { price_at_booking: services[0].price },
      [services[1].id]: { price_at_booking: services[1].price },
    })

    // Accepted booking (waiting for payment)
    const booking2 = await Booking.create({
      userId: users[1].id,
      hallId: halls[3].id,
      bookingDate: DateTime.now().plus({ days: 30 }),
      startTime: '19:00',
      endTime: '23:00',
      status: 'accepted',
      totalPrice: 18000,
      paymentStatus: 'unpaid',
      companyRespondedAt: DateTime.now().minus({ days: 2 }),
      paymentDueDate: DateTime.now().plus({ days: 1 }),
      expiresAt: DateTime.now().minus({ days: 5 }),
    })

    // Confirmed booking (paid)
    const booking3 = await Booking.create({
      userId: users[0].id,
      hallId: halls[4].id,
      bookingDate: DateTime.now().plus({ days: 60 }),
      startTime: '14:00',
      endTime: '18:00',
      status: 'confirmed',
      totalPrice: 14000,
      paymentStatus: 'paid',
      companyRespondedAt: DateTime.now().minus({ days: 10 }),
      expiresAt: DateTime.now().minus({ days: 17 }),
    })
    await booking3.related('services').attach({
      [services[5].id]: { price_at_booking: services[5].price },
    })

    // Rejected booking
    await Booking.create({
      userId: users[2].id,
      hallId: halls[0].id,
      bookingDate: DateTime.now().plus({ days: 20 }),
      startTime: '18:00',
      endTime: '22:00',
      status: 'rejected',
      totalPrice: 25000,
      paymentStatus: 'unpaid',
      rejectionReason:
        'The hall is already booked for a private event on this date. Please consider alternative dates.',
      companyRespondedAt: DateTime.now().minus({ days: 3 }),
      expiresAt: DateTime.now().minus({ days: 4 }),
    })

    // Cancelled booking
    await Booking.create({
      userId: users[1].id,
      hallId: halls[1].id,
      bookingDate: DateTime.now().plus({ days: 15 }),
      startTime: '16:00',
      endTime: '20:00',
      status: 'cancelled',
      totalPrice: 10000,
      paymentStatus: 'unpaid',
      expiresAt: DateTime.now().minus({ days: 8 }),
    })

    // Completed booking (past event)
    await Booking.create({
      userId: users[0].id,
      hallId: halls[3].id,
      bookingDate: DateTime.now().minus({ days: 10 }),
      startTime: '19:00',
      endTime: '23:00',
      status: 'completed',
      totalPrice: 22500,
      paymentStatus: 'paid',
      companyRespondedAt: DateTime.now().minus({ days: 25 }),
      expiresAt: DateTime.now().minus({ days: 32 }),
    })

    // Expired booking (company didn't respond)
    await Booking.create({
      userId: users[2].id,
      hallId: halls[4].id,
      bookingDate: DateTime.now().plus({ days: 25 }),
      startTime: '18:00',
      endTime: '22:00',
      status: 'expired',
      totalPrice: 14000,
      paymentStatus: 'unpaid',
      expiresAt: DateTime.now().minus({ days: 1 }),
    })

    console.log(`  Created 7 bookings with various statuses`)

    // ==================== NOTIFICATIONS ====================
    console.log('Creating notifications...')

    await Notification.createMany([
      // User notifications
      {
        userId: users[0].id,
        type: 'booking_accepted',
        title: 'Booking Confirmed',
        message:
          'Great news! Your booking for "Golden Ballroom" has been accepted. Please proceed with payment.',
        data: { bookingId: booking2.id, hallName: 'Golden Ballroom' },
        readAt: null,
      },
      {
        userId: users[0].id,
        type: 'email_verified',
        title: 'Email Verified',
        message: 'Your email has been verified successfully. You can now make bookings.',
        data: null,
        readAt: DateTime.now().minus({ days: 5 }),
      },
      {
        userId: users[2].id,
        type: 'booking_rejected',
        title: 'Booking Rejected',
        message: 'Unfortunately, your booking for "Royal Grand Hall" was rejected.',
        data: { bookingId: 4, hallName: 'Royal Grand Hall', reason: 'Hall already booked' },
        readAt: null,
      },
      {
        userId: users[2].id,
        type: 'booking_expired',
        title: 'Booking Expired',
        message:
          'Your booking request for "Pearl Hall" has expired as the company did not respond.',
        data: { bookingId: 7, hallName: 'Pearl Hall' },
        readAt: null,
      },
      // Company notifications
      {
        userId: companyUser1.id,
        type: 'new_booking_request',
        title: 'New Booking Request',
        message:
          'You have a new booking request for "Royal Grand Hall" on ' +
          DateTime.now().plus({ days: 45 }).toFormat('yyyy-MM-dd'),
        data: { bookingId: booking1.id, hallName: 'Royal Grand Hall' },
        readAt: null,
      },
      {
        userId: companyUser1.id,
        type: 'company_approved',
        title: 'Company Approved',
        message:
          'Congratulations! Your company "Royal Events Co." has been approved. You can now create halls.',
        data: null,
        readAt: DateTime.now().minus({ days: 30 }),
      },
      {
        userId: companyUser2.id,
        type: 'company_approved',
        title: 'Company Approved',
        message: 'Congratulations! Your company "Golden Palace Events" has been approved.',
        data: null,
        readAt: DateTime.now().minus({ days: 15 }),
      },
      {
        userId: companyUser4.id,
        type: 'company_rejected',
        title: 'Company Rejected',
        message:
          'Your company registration was rejected. Reason: Incomplete business documentation.',
        data: { reason: 'Incomplete business documentation' },
        readAt: null,
      },
    ])

    console.log(`  Created 8 notifications`)

    // ==================== SUMMARY ====================
    console.log('\n========== SEEDING COMPLETE ==========')
    console.log('\nTest Accounts:')
    console.log('─'.repeat(50))
    console.log('ADMIN:')
    console.log('  Email: admin@qaat.app')
    console.log('  Password: admin123')
    console.log('')
    console.log('USERS (verified):')
    console.log('  Email: mohammed@example.com | Password: password123')
    console.log('  Email: sara@example.com | Password: password123')
    console.log('  Email: ahmed@example.com | Password: password123')
    console.log('')
    console.log('USER (unverified):')
    console.log('  Email: fatima@example.com | Password: password123')
    console.log('')
    console.log('COMPANIES (approved):')
    console.log('  Email: royal@example.com | Password: password123')
    console.log('  Email: golden@example.com | Password: password123')
    console.log('')
    console.log('COMPANY (pending):')
    console.log('  Email: star@example.com | Password: password123')
    console.log('')
    console.log('COMPANY (rejected):')
    console.log('  Email: quick@example.com | Password: password123')
    console.log('─'.repeat(50))
    console.log('\nData Summary:')
    console.log(`  - 1 Admin`)
    console.log(`  - 4 Users (3 verified, 1 unverified)`)
    console.log(`  - 4 Companies (2 approved, 1 pending, 1 rejected)`)
    console.log(`  - 6 Halls (5 available, 1 unavailable)`)
    console.log(`  - 8 Services`)
    console.log(`  - 7 Bookings (various statuses)`)
    console.log(`  - 8 Notifications`)
  }
}
