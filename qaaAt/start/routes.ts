/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'
import {
  authThrottle,
  bookingCreationThrottle,
  pushRegistrationThrottle,
  resendVerificationThrottle,
} from '#start/limiter'
import { middleware } from './kernel.js'

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// Public Hall Routes (no auth required)
router
  .group(() => {
    router.get('/', [controllers.PublicHall, 'index']).openapi({
      summary: 'Browse public halls',
      operationId: 'listPublicHalls',
      tags: ['Public halls'],
      security: [],
    })
    router.get('/cities', [controllers.PublicHall, 'cities']).openapi({
      summary: 'List public hall cities',
      operationId: 'listPublicHallCities',
      tags: ['Public halls'],
      security: [],
    })
    router.get('/:id', [controllers.PublicHall, 'show']).openapi({
      summary: 'Get public hall details',
      operationId: 'getPublicHall',
      tags: ['Public halls'],
      security: [],
      responses: { 200: { description: 'Hall details' }, 404: { description: 'Hall not found' } },
    })
    router.get('/:id/availability', [controllers.PublicHall, 'availability']).openapi({
      summary: 'Get hall availability',
      operationId: 'getHallAvailability',
      tags: ['Public halls'],
      security: [],
      responses: {
        200: { description: 'Available time slots' },
        400: { description: 'Invalid date' },
        404: { description: 'Hall not found' },
      },
    })
  })
  .prefix('/api/halls')

// User Authentication Routes
router
  .group(() => {
    router.post('/register', [controllers.auth.UserAuth, 'register']).use(authThrottle)
    router.post('/login', [controllers.auth.UserAuth, 'login']).use(authThrottle)
    router.get('/me', [controllers.auth.UserAuth, 'me']).use(middleware.auth())
    router.post('/logout', [controllers.auth.UserAuth, 'logout']).use(middleware.auth())

    router
      .post('/push-installations', [controllers.UserPushInstallations, 'store'])
      .openapi({
        summary: 'Register or refresh a user push installation',
        operationId: 'registerUserPushInstallation',
        tags: ['User push notifications'],
        responses: {
          200: { description: 'Installation registered or refreshed' },
          403: { description: 'User is not eligible for push registration' },
          422: { description: 'Invalid installation metadata or Expo push token' },
          429: { description: 'Registration rate limit exceeded' },
        },
      })
      .use([
        middleware.auth(),
        middleware.userType(),
        middleware.verifiedEmail(),
        pushRegistrationThrottle,
      ])
    router
      .delete('/push-installations/:installationId', [controllers.UserPushInstallations, 'destroy'])
      .openapi({
        summary: 'Revoke a user push installation',
        operationId: 'revokeUserPushInstallation',
        tags: ['User push notifications'],
        responses: { 204: { description: 'Installation revoked or already absent' } },
      })
      .use([middleware.auth(), middleware.userType()])

    // Email verification routes (no auth required)
    router.post('/verify-email', [controllers.auth.UserAuth, 'verifyEmail']).use(authThrottle)
    router
      .post('/resend-verification', [controllers.auth.UserAuth, 'resendVerification'])
      .use(resendVerificationThrottle)

    // User notification routes (auth + user type required)
    router
      .get('/notifications', [controllers.Notification, 'index'])
      .as('users.notification.index')
      .use([middleware.auth(), middleware.userType()])
    router
      .get('/notifications/unread-count', [controllers.Notification, 'unreadCount'])
      .as('users.notification.unreadCount')
      .use([middleware.auth(), middleware.userType()])
    router
      .post('/notifications/:id/read', [controllers.Notification, 'markAsRead'])
      .as('users.notification.markAsRead')
      .use([middleware.auth(), middleware.userType()])
    router
      .post('/notifications/read-all', [controllers.Notification, 'markAllAsRead'])
      .as('users.notification.markAllAsRead')
      .use([middleware.auth(), middleware.userType()])

    // User booking routes (auth + verified email required)
    router
      .get('/bookings', [controllers.UserBooking, 'index'])
      .use([middleware.auth(), middleware.userType()])
    router
      .post('/bookings', [controllers.UserBooking, 'store'])
      .use([
        middleware.auth(),
        middleware.userType(),
        middleware.verifiedEmail(),
        bookingCreationThrottle,
      ])
    router
      .get('/bookings/:id', [controllers.UserBooking, 'show'])
      .use([middleware.auth(), middleware.userType()])
    router
      .post('/bookings/:id/cancel', [controllers.UserBooking, 'cancel'])
      .use([middleware.auth(), middleware.userType()])
  })
  .prefix('/api/users')

// Company Authentication Routes
router
  .group(() => {
    router.post('/register', [controllers.auth.CompanyAuth, 'register']).use(authThrottle)
    router.post('/login', [controllers.auth.CompanyAuth, 'login']).use(authThrottle)
    router.get('/me', [controllers.auth.CompanyAuth, 'me']).use(middleware.auth())
    router.post('/logout', [controllers.auth.CompanyAuth, 'logout']).use(middleware.auth())

    router
      .post('/push-installations', [controllers.PushInstallations, 'store'])
      .openapi({
        summary: 'Register or refresh a company push installation',
        operationId: 'registerCompanyPushInstallation',
        tags: ['Company push notifications'],
        responses: {
          200: { description: 'Installation registered or refreshed' },
          403: { description: 'Company is not eligible for push registration' },
          422: { description: 'Invalid installation metadata or Expo push token' },
          429: { description: 'Registration rate limit exceeded' },
        },
      })
      .use([middleware.auth(), middleware.company(), pushRegistrationThrottle])
    router
      .delete('/push-installations/:installationId', [controllers.PushInstallations, 'destroy'])
      .openapi({
        summary: 'Revoke a company push installation',
        operationId: 'revokeCompanyPushInstallation',
        tags: ['Company push notifications'],
        responses: { 204: { description: 'Installation revoked or already absent' } },
      })
      .use([middleware.auth(), middleware.company()])

    // Company notification routes (auth required)
    router
      .get('/notifications', [controllers.Notification, 'index'])
      .as('companies.notification.index')
      .use([middleware.auth(), middleware.company()])
    router
      .get('/notifications/unread-count', [controllers.Notification, 'unreadCount'])
      .as('companies.notification.unreadCount')
      .use([middleware.auth(), middleware.company()])
    router
      .post('/notifications/:id/read', [controllers.Notification, 'markAsRead'])
      .as('companies.notification.markAsRead')
      .use([middleware.auth(), middleware.company()])
    router
      .post('/notifications/read-all', [controllers.Notification, 'markAllAsRead'])
      .as('companies.notification.markAllAsRead')
      .use([middleware.auth(), middleware.company()])

    // Company booking routes (auth + company + approved required)
    router
      .get('/bookings', [controllers.CompanyBooking, 'index'])
      .use([middleware.auth(), middleware.company(), middleware.approvedCompany()])
    router
      .get('/bookings/pending', [controllers.CompanyBooking, 'pending'])
      .use([middleware.auth(), middleware.company(), middleware.approvedCompany()])
    router
      .get('/bookings/:id', [controllers.CompanyBooking, 'show'])
      .use([middleware.auth(), middleware.company(), middleware.approvedCompany()])
    router
      .post('/bookings/:id/accept', [controllers.CompanyBooking, 'accept'])
      .use([middleware.auth(), middleware.company(), middleware.approvedCompany()])
    router
      .post('/bookings/:id/reject', [controllers.CompanyBooking, 'reject'])
      .use([middleware.auth(), middleware.company(), middleware.approvedCompany()])
  })
  .prefix('/api/companies')

// Company Hall Management Routes (requires auth + approved company)
router
  .group(() => {
    router.get('/', [controllers.Hall, 'index']).openapi({
      summary: 'List company halls',
      operationId: 'listCompanyHalls',
      tags: ['Company halls'],
      security: [{ bearer: [] }],
    })
    router.get('/:id', [controllers.Hall, 'show']).openapi({
      summary: 'Get company hall details',
      operationId: 'getCompanyHall',
      tags: ['Company halls'],
      security: [{ bearer: [] }],
    })
    router
      .post('/', [controllers.Hall, 'store'])
      .use([middleware.approvedCompany()])
      .openapi({
        summary: 'Create a hall',
        operationId: 'createCompanyHall',
        tags: ['Company halls'],
        security: [{ bearer: [] }],
        responses: {
          201: { description: 'Hall created' },
          422: { description: 'Validation failed' },
        },
      })
    router
      .put('/:id', [controllers.Hall, 'update'])
      .use([middleware.approvedCompany()])
      .openapi({
        summary: 'Update a hall',
        operationId: 'updateCompanyHall',
        tags: ['Company halls'],
        security: [{ bearer: [] }],
        responses: {
          200: { description: 'Hall updated' },
          404: { description: 'Hall not found' },
          422: { description: 'Validation failed' },
        },
      })
    router
      .delete('/:id', [controllers.Hall, 'destroy'])
      .use([middleware.approvedCompany()])
      .openapi({
        summary: 'Delete a hall',
        operationId: 'deleteCompanyHall',
        tags: ['Company halls'],
        security: [{ bearer: [] }],
        responses: { 200: { description: 'Hall deleted' }, 404: { description: 'Hall not found' } },
      })
  })
  .prefix('/api/companies/halls')
  .use([middleware.auth(), middleware.company()])

// Admin Authentication Routes
router
  .group(() => {
    router.post('/login', [controllers.auth.AdminAuth, 'login']).use(authThrottle)
    router.get('/me', [controllers.auth.AdminAuth, 'me']).use(middleware.auth())
    router.post('/logout', [controllers.auth.AdminAuth, 'logout']).use(middleware.auth())
  })
  .prefix('/api/admin')

// Admin Management Routes (all require auth + admin middleware)
router
  .group(() => {
    // Statistics
    router.get('/statistics', [controllers.Admin, 'getStatistics'])

    // Users Management
    router.get('/users', [controllers.Admin, 'getUsers'])
    router.get('/users/:id', [controllers.Admin, 'getUser'])
    router.post('/users/:id/ban', [controllers.Admin, 'banUser'])
    router.post('/users/:id/unban', [controllers.Admin, 'unbanUser'])

    // Companies Management
    router.get('/companies', [controllers.Admin, 'getCompanies'])
    router.get('/companies/pending', [controllers.Admin, 'getPendingCompanies'])
    router.get('/companies/:id', [controllers.Admin, 'getCompany'])
    router.post('/companies/:id/ban', [controllers.Admin, 'banCompany'])
    router.post('/companies/:id/unban', [controllers.Admin, 'unbanCompany'])
    router.post('/companies/:id/approve', [controllers.Admin, 'approveCompany'])
    router.post('/companies/:id/reject', [controllers.Admin, 'rejectCompany'])
    router.post('/companies/:id/suspend', [controllers.Admin, 'suspendCompany'])
    router.post('/companies/:id/reactivate', [controllers.Admin, 'reactivateCompany'])

    // Halls Management
    router.get('/halls', [controllers.Admin, 'getHalls'])
    router.delete('/halls/:id', [controllers.Admin, 'deleteHall'])

    // Bookings Management
    router.get('/bookings', [controllers.Admin, 'getBookings'])
    router.delete('/bookings/:id', [controllers.Admin, 'deleteBooking'])
  })
  .prefix('/api/admin')
  .use([middleware.auth(), middleware.admin()])

// Health Check Routes
router.get('/health', [controllers.HealthChecks, 'handle'])
router.get('/health/live', [controllers.HealthChecks, 'live'])
