/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from './kernel.js'
import openapi from '@foadonis/openapi/services/main'

openapi.registerRoutes()

const UserAuthController = () => import('#controllers/auth/user_auth_controller')
const CompanyAuthController = () => import('#controllers/auth/company_auth_controller')
const AdminAuthController = () => import('#controllers/auth/admin_auth_controller')
const AdminController = () => import('#controllers/admin_controller')
const HallController = () => import('#controllers/hall_controller')
const NotificationController = () => import('#controllers/notification_controller')
const PublicHallController = () => import('#controllers/public_hall_controller')
const UserBookingController = () => import('#controllers/user_booking_controller')
const CompanyBookingController = () => import('#controllers/company_booking_controller')
const HealthChecksController = () => import('#controllers/health_checks_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// Public Hall Routes (no auth required)
router
  .group(() => {
    router.get('/', [PublicHallController, 'index'])
    router.get('/cities', [PublicHallController, 'cities'])
    router.get('/:id', [PublicHallController, 'show'])
    router.get('/:id/availability', [PublicHallController, 'availability'])
  })
  .prefix('/api/halls')

// User Authentication Routes
router
  .group(() => {
    router.post('/register', [UserAuthController, 'register'])
    router.post('/login', [UserAuthController, 'login'])
    router.get('/me', [UserAuthController, 'me']).use(middleware.auth())
    router.post('/logout', [UserAuthController, 'logout']).use(middleware.auth())

    // Email verification routes (no auth required)
    router.get('/verify-email/:token', [UserAuthController, 'verifyEmail'])
    router.post('/resend-verification', [UserAuthController, 'resendVerification'])

    // User notification routes (auth + user type required)
    router
      .get('/notifications', [NotificationController, 'index'])
      .use([middleware.auth(), middleware.userType()])
    router
      .get('/notifications/unread-count', [NotificationController, 'unreadCount'])
      .use([middleware.auth(), middleware.userType()])
    router
      .post('/notifications/:id/read', [NotificationController, 'markAsRead'])
      .use([middleware.auth(), middleware.userType()])
    router
      .post('/notifications/read-all', [NotificationController, 'markAllAsRead'])
      .use([middleware.auth(), middleware.userType()])

    // User booking routes (auth + verified email required)
    router.get('/bookings', [UserBookingController, 'index']).use(middleware.auth())
    router
      .post('/bookings', [UserBookingController, 'store'])
      .use([middleware.auth(), middleware.verifiedEmail()])
    router.get('/bookings/:id', [UserBookingController, 'show']).use(middleware.auth())
    router.post('/bookings/:id/cancel', [UserBookingController, 'cancel']).use(middleware.auth())
  })
  .prefix('/api/users')

// Company Authentication Routes
router
  .group(() => {
    router.post('/register', [CompanyAuthController, 'register'])
    router.post('/login', [CompanyAuthController, 'login'])
    router.get('/me', [CompanyAuthController, 'me']).use(middleware.auth())
    router.post('/logout', [CompanyAuthController, 'logout']).use(middleware.auth())

    // Company notification routes (auth required)
    router
      .get('/notifications', [NotificationController, 'index'])
      .use([middleware.auth(), middleware.company()])
    router
      .get('/notifications/unread-count', [NotificationController, 'unreadCount'])
      .use([middleware.auth(), middleware.company()])
    router
      .post('/notifications/:id/read', [NotificationController, 'markAsRead'])
      .use([middleware.auth(), middleware.company()])
    router
      .post('/notifications/read-all', [NotificationController, 'markAllAsRead'])
      .use([middleware.auth(), middleware.company()])

    // Company booking routes (auth + company + approved required)
    router
      .get('/bookings', [CompanyBookingController, 'index'])
      .use([middleware.auth(), middleware.company(), middleware.approvedCompany()])
    router
      .get('/bookings/pending', [CompanyBookingController, 'pending'])
      .use([middleware.auth(), middleware.company(), middleware.approvedCompany()])
    router
      .get('/bookings/:id', [CompanyBookingController, 'show'])
      .use([middleware.auth(), middleware.company(), middleware.approvedCompany()])
    router
      .post('/bookings/:id/accept', [CompanyBookingController, 'accept'])
      .use([middleware.auth(), middleware.company(), middleware.approvedCompany()])
    router
      .post('/bookings/:id/reject', [CompanyBookingController, 'reject'])
      .use([middleware.auth(), middleware.company(), middleware.approvedCompany()])
  })
  .prefix('/api/companies')

// Company Hall Management Routes (requires auth + approved company)
router
  .group(() => {
    router.get('/', [HallController, 'index'])
    router.get('/:id', [HallController, 'show'])
    router.post('/', [HallController, 'store']).use([middleware.approvedCompany()])
    router.put('/:id', [HallController, 'update']).use([middleware.approvedCompany()])
    router.delete('/:id', [HallController, 'destroy']).use([middleware.approvedCompany()])
  })
  .prefix('/api/companies/halls')
  .use([middleware.auth(), middleware.company()])

// Admin Authentication Routes
router
  .group(() => {
    router.post('/login', [AdminAuthController, 'login'])
    router.get('/me', [AdminAuthController, 'me']).use(middleware.auth())
    router.post('/logout', [AdminAuthController, 'logout']).use(middleware.auth())
  })
  .prefix('/api/admin')

// Admin Management Routes (all require auth + admin middleware)
router
  .group(() => {
    // Statistics
    router.get('/statistics', [AdminController, 'getStatistics'])

    // Users Management
    router.get('/users', [AdminController, 'getUsers'])
    router.get('/users/:id', [AdminController, 'getUser'])
    router.post('/users/:id/ban', [AdminController, 'banUser'])
    router.post('/users/:id/unban', [AdminController, 'unbanUser'])

    // Companies Management
    router.get('/companies', [AdminController, 'getCompanies'])
    router.get('/companies/pending', [AdminController, 'getPendingCompanies'])
    router.get('/companies/:id', [AdminController, 'getCompany'])
    router.post('/companies/:id/ban', [AdminController, 'banCompany'])
    router.post('/companies/:id/unban', [AdminController, 'unbanCompany'])
    router.post('/companies/:id/approve', [AdminController, 'approveCompany'])
    router.post('/companies/:id/reject', [AdminController, 'rejectCompany'])
    router.post('/companies/:id/suspend', [AdminController, 'suspendCompany'])
    router.post('/companies/:id/reactivate', [AdminController, 'reactivateCompany'])

    // Halls Management
    router.get('/halls', [AdminController, 'getHalls'])
    router.delete('/halls/:id', [AdminController, 'deleteHall'])

    // Bookings Management
    router.get('/bookings', [AdminController, 'getBookings'])
    router.delete('/bookings/:id', [AdminController, 'deleteBooking'])
  })
  .prefix('/api/admin')
  .use([middleware.auth(), middleware.admin()])

// Health Check Routes
router.get('/health', [HealthChecksController, 'handle'])
