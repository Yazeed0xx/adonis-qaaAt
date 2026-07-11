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
    router
      .get('/me', [controllers.auth.UserAuth, 'me'])
      .use([middleware.auth(), middleware.userType()])
    router
      .post('/logout', [controllers.auth.UserAuth, 'logout'])
      .use([middleware.auth(), middleware.userType()])

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
    router
      .get('/me', [controllers.auth.CompanyAuth, 'me'])
      .use([middleware.auth(), middleware.company()])
    router
      .post('/logout', [controllers.auth.CompanyAuth, 'logout'])
      .use([middleware.auth(), middleware.company()])

    router
      .get('/members', [controllers.CompanyMembers, 'index'])
      .openapi({
        summary: 'List company members',
        operationId: 'listCompanyMembers',
        tags: ['Company memberships'],
        security: [{ bearer: [] }],
      })
      .use([middleware.auth(), middleware.company()])
    router
      .patch('/members/:id', [controllers.CompanyMembers, 'update'])
      .openapi({
        summary: 'Update a company member',
        operationId: 'updateCompanyMember',
        tags: ['Company memberships'],
        security: [{ bearer: [] }],
      })
      .use([middleware.auth(), middleware.company()])
    router
      .delete('/members/:id', [controllers.CompanyMembers, 'destroy'])
      .openapi({
        summary: 'Revoke a company member',
        operationId: 'revokeCompanyMember',
        tags: ['Company memberships'],
        security: [{ bearer: [] }],
        responses: {
          204: { description: 'Membership revoked' },
          409: { description: 'Last active owner' },
        },
      })
      .use([middleware.auth(), middleware.company()])
    router
      .get('/invitations', [controllers.CompanyInvitations, 'index'])
      .openapi({
        summary: 'List company invitations',
        operationId: 'listCompanyInvitations',
        tags: ['Company invitations'],
        security: [{ bearer: [] }],
      })
      .use([middleware.auth(), middleware.company()])
    router
      .post('/invitations', [controllers.CompanyInvitations, 'store'])
      .openapi({
        summary: 'Create a company invitation',
        operationId: 'createCompanyInvitation',
        tags: ['Company invitations'],
        security: [{ bearer: [] }],
        responses: {
          201: { description: 'Invitation created' },
          422: { description: 'Validation failed' },
        },
      })
      .use([middleware.auth(), middleware.company(), middleware.approvedCompany()])
    router
      .post('/invitations/:id/resend', [controllers.CompanyInvitations, 'resend'])
      .openapi({
        summary: 'Resend a company invitation',
        operationId: 'resendCompanyInvitation',
        tags: ['Company invitations'],
        security: [{ bearer: [] }],
      })
      .use([middleware.auth(), middleware.company(), middleware.approvedCompany()])
    router
      .delete('/invitations/:id', [controllers.CompanyInvitations, 'destroy'])
      .openapi({
        summary: 'Cancel a company invitation',
        operationId: 'cancelCompanyInvitation',
        tags: ['Company invitations'],
        security: [{ bearer: [] }],
        responses: { 204: { description: 'Invitation cancelled' } },
      })
      .use([middleware.auth(), middleware.company()])

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

router
  .group(() => {
    router.get('/', [controllers.Venues, 'index']).openapi({
      summary: 'List company venues',
      operationId: 'listCompanyVenues',
      tags: ['Venues'],
      security: [{ bearer: [] }],
    })
    router.get('/:id', [controllers.Venues, 'show']).openapi({
      summary: 'Get company venue',
      operationId: 'getCompanyVenue',
      tags: ['Venues'],
      security: [{ bearer: [] }],
    })
    router
      .post('/', [controllers.Venues, 'store'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Create a venue',
        operationId: 'createVenue',
        tags: ['Venues'],
        security: [{ bearer: [] }],
        responses: {
          201: { description: 'Venue created' },
          422: { description: 'Validation failed' },
        },
      })
    router
      .patch('/:id', [controllers.Venues, 'update'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Update a venue',
        operationId: 'updateVenue',
        tags: ['Venues'],
        security: [{ bearer: [] }],
      })
  })
  .prefix('/api/companies/venues')
  .use([middleware.auth(), middleware.company()])

router
  .group(() => {
    router.get('/', [controllers.Spaces, 'index']).openapi({
      summary: 'List company spaces',
      operationId: 'listCompanySpaces',
      tags: ['Spaces'],
      security: [{ bearer: [] }],
    })
    router.get('/:id', [controllers.Spaces, 'show']).openapi({
      summary: 'Preview a company space',
      operationId: 'getCompanySpace',
      tags: ['Spaces'],
      security: [{ bearer: [] }],
    })
    router
      .post('/', [controllers.Spaces, 'store'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Create a draft space',
        operationId: 'createSpace',
        tags: ['Spaces'],
        security: [{ bearer: [] }],
        responses: {
          201: { description: 'Draft space created' },
          422: { description: 'Validation failed' },
        },
      })
    router
      .patch('/:id', [controllers.Spaces, 'update'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Update a draft or changes-requested space',
        operationId: 'updateSpace',
        tags: ['Spaces'],
        security: [{ bearer: [] }],
      })
    router
      .post('/:id/submissions', [controllers.Spaces, 'submit'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Submit a space for review',
        operationId: 'submitSpace',
        tags: ['Space moderation'],
        security: [{ bearer: [] }],
      })
    router
      .delete('/:id', [controllers.Spaces, 'destroy'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Archive a space',
        operationId: 'archiveSpace',
        tags: ['Spaces'],
        security: [{ bearer: [] }],
        responses: { 204: { description: 'Space archived' } },
      })
  })
  .prefix('/api/companies/spaces')
  .use([middleware.auth(), middleware.company()])

router
  .group(() => {
    router.get('/', [controllers.CompanyCalendar, 'index']).openapi({
      summary: 'Read company calendar feed',
      tags: ['Calendar'],
      security: [{ bearer: [] }],
    })
    router.get('/spaces/:id/policy', [controllers.CompanyCalendar, 'showPolicy']).openapi({
      summary: 'Read a Space availability policy',
      tags: ['Calendar'],
      security: [{ bearer: [] }],
    })
    router
      .put('/spaces/:id/policy', [controllers.CompanyCalendar, 'policy'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Replace a Space availability policy',
        tags: ['Calendar'],
        security: [{ bearer: [] }],
      })
    router.get('/spaces/:id/sessions', [controllers.CompanyCalendar, 'listSessions']).openapi({
      summary: 'List named Space sessions',
      tags: ['Calendar'],
      security: [{ bearer: [] }],
    })
    router
      .post('/spaces/:id/sessions', [controllers.CompanyCalendar, 'createSession'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Create a named Space session',
        tags: ['Calendar'],
        security: [{ bearer: [] }],
        responses: {
          201: { description: 'Created' },
          422: { description: 'Invalid or overlapping session' },
        },
      })
    router
      .put('/spaces/:id/sessions/:sessionId', [controllers.CompanyCalendar, 'updateSession'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Update a named Space session',
        tags: ['Calendar'],
        security: [{ bearer: [] }],
      })
    router
      .delete('/spaces/:id/sessions/:sessionId', [controllers.CompanyCalendar, 'destroySession'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Delete a named Space session',
        tags: ['Calendar'],
        security: [{ bearer: [] }],
        responses: { 204: { description: 'Deleted' } },
      })
    router.get('/spaces/:id/exceptions', [controllers.CompanyCalendar, 'listExceptions']).openapi({
      summary: 'List Space schedule exceptions',
      tags: ['Calendar'],
      security: [{ bearer: [] }],
    })
    router
      .post('/spaces/:id/exceptions', [controllers.CompanyCalendar, 'exception'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Create a schedule-only date exception',
        description:
          'Schedule exceptions alter offered candidates and do not create inventory blocks.',
        tags: ['Calendar'],
        security: [{ bearer: [] }],
      })
    router
      .put('/spaces/:id/exceptions/:exceptionId', [controllers.CompanyCalendar, 'updateException'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Update a Space schedule exception',
        tags: ['Calendar'],
        security: [{ bearer: [] }],
      })
    router
      .delete('/spaces/:id/exceptions/:exceptionId', [
        controllers.CompanyCalendar,
        'destroyException',
      ])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Delete a Space schedule exception',
        tags: ['Calendar'],
        security: [{ bearer: [] }],
        responses: { 204: { description: 'Deleted' } },
      })
    router
      .post('/external-reservations', [controllers.CompanyCalendar, 'external'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Create an operational inventory block',
        tags: ['Calendar'],
        security: [{ bearer: [] }],
        responses: { 201: { description: 'Created' }, 409: { description: 'Inventory overlap' } },
      })
    router
      .patch('/external-reservations/:id', [controllers.CompanyCalendar, 'updateExternal'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Update an external reservation and block atomically',
        tags: ['Calendar'],
        security: [{ bearer: [] }],
        responses: { 200: { description: 'Updated' }, 409: { description: 'Inventory overlap' } },
      })
    router
      .delete('/external-reservations/:id', [controllers.CompanyCalendar, 'destroyExternal'])
      .use(middleware.approvedCompany())
      .openapi({
        summary: 'Cancel and release an external reservation',
        tags: ['Calendar'],
        security: [{ bearer: [] }],
      })
  })
  .prefix('/api/companies/calendar')
  .use([middleware.auth(), middleware.company()])

router.get('/api/spaces/:id/availability', [controllers.PublicAvailability, 'show']).openapi({
  summary: 'Get bounded public Space availability',
  tags: ['Availability'],
  security: [],
  responses: {
    200: { description: 'Availability' },
    422: { description: 'Invalid or excessive range' },
  },
})

router.get('/api/space-catalog', [controllers.SpaceCatalog, 'index']).openapi({
  summary: 'List controlled space categories and amenities',
  operationId: 'getSpaceCatalog',
  tags: ['Spaces'],
  security: [],
})
router.get('/api/spaces/:id', [controllers.PublicSpaces, 'show']).openapi({
  summary: 'Get a safely published space',
  operationId: 'getPublicSpace',
  tags: ['Spaces'],
  security: [],
  responses: {
    200: { description: 'Published space' },
    404: { description: 'Space unavailable or not published' },
  },
})

// Admin Authentication Routes
router
  .group(() => {
    router.post('/login', [controllers.auth.AdminAuth, 'login']).use(authThrottle)
    router
      .get('/me', [controllers.auth.AdminAuth, 'me'])
      .use([middleware.auth(), middleware.admin()])
    router
      .post('/logout', [controllers.auth.AdminAuth, 'logout'])
      .use([middleware.auth(), middleware.admin()])
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

    router.get('/spaces', [controllers.AdminSpaces, 'index'])
    router.get('/spaces/pending', [controllers.AdminSpaces, 'pending'])
    router.get('/spaces/:id', [controllers.AdminSpaces, 'show'])
    router.post('/spaces/:id/publish', [controllers.AdminSpaces, 'publish'])
    router.post('/spaces/:id/request-changes', [controllers.AdminSpaces, 'requestChanges'])
    router.post('/spaces/:id/suspend', [controllers.AdminSpaces, 'suspend'])
  })
  .prefix('/api/admin')
  .use([middleware.auth(), middleware.admin()])

// Health Check Routes
router.get('/health', [controllers.HealthChecks, 'handle'])
router.get('/health/live', [controllers.HealthChecks, 'live'])

router
  .get('/api/company-invitations/inspect', [controllers.PublicCompanyInvitations, 'inspect'])
  .openapi({
    summary: 'Inspect a company invitation',
    operationId: 'inspectCompanyInvitation',
    tags: ['Company invitations'],
    security: [],
  })
router
  .post('/api/company-invitations/accept', [controllers.PublicCompanyInvitations, 'accept'])
  .openapi({
    summary: 'Accept a company invitation',
    operationId: 'acceptCompanyInvitation',
    tags: ['Company invitations'],
    security: [],
    responses: {
      201: { description: 'Invitation accepted' },
      401: { description: 'Existing account authentication required' },
      409: { description: 'Invitation conflict' },
      410: { description: 'Invitation expired' },
    },
  })
