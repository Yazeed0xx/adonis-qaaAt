/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import openapi from '@foadonis/openapi/services/main'
import { controllers } from '#generated/controllers'
import {
  authThrottle,
  bookingCreationThrottle,
  resendVerificationThrottle,
} from '#start/limiter'
import { middleware } from './kernel.js'

openapi.registerRoutes()

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// Public Hall Routes (no auth required)
router
  .group(() => {
    router.get('/', [controllers.PublicHall, 'index'])
    router.get('/cities', [controllers.PublicHall, 'cities'])
    router.get('/:id', [controllers.PublicHall, 'show'])
    router.get('/:id/availability', [controllers.PublicHall, 'availability'])
  })
  .prefix('/api/halls')

// User Authentication Routes
router
  .group(() => {
    router.post('/register', [controllers.auth.UserAuth, 'register']).use(authThrottle)
    router.post('/login', [controllers.auth.UserAuth, 'login']).use(authThrottle)
    router.get('/me', [controllers.auth.UserAuth, 'me']).use(middleware.auth())
    router.post('/logout', [controllers.auth.UserAuth, 'logout']).use(middleware.auth())

    // Email verification routes (no auth required)
    router.get('/verify-email/:token', [controllers.auth.UserAuth, 'verifyEmail'])
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
    router.get('/bookings', [controllers.UserBooking, 'index']).use(middleware.auth())
    router
      .post('/bookings', [controllers.UserBooking, 'store'])
      .use([middleware.auth(), middleware.verifiedEmail(), bookingCreationThrottle])
    router.get('/bookings/:id', [controllers.UserBooking, 'show']).use(middleware.auth())
    router.post('/bookings/:id/cancel', [controllers.UserBooking, 'cancel']).use(middleware.auth())
  })
  .prefix('/api/users')

// Company Authentication Routes
router
  .group(() => {
    router.post('/register', [controllers.auth.CompanyAuth, 'register']).use(authThrottle)
    router.post('/login', [controllers.auth.CompanyAuth, 'login']).use(authThrottle)
    router.get('/me', [controllers.auth.CompanyAuth, 'me']).use(middleware.auth())
    router.post('/logout', [controllers.auth.CompanyAuth, 'logout']).use(middleware.auth())

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
    router.get('/', [controllers.Hall, 'index'])
    router.get('/:id', [controllers.Hall, 'show'])
    router.post('/', [controllers.Hall, 'store']).use([middleware.approvedCompany()])
    router.put('/:id', [controllers.Hall, 'update']).use([middleware.approvedCompany()])
    router.delete('/:id', [controllers.Hall, 'destroy']).use([middleware.approvedCompany()])
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
