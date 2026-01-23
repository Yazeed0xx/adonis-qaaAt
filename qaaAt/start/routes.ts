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

const UserAuthController = () => import('#controllers/auth/user_auth_controller')
const CompanyAuthController = () => import('#controllers/auth/company_auth_controller')
const AdminAuthController = () => import('#controllers/auth/admin_auth_controller')
const AdminController = () => import('#controllers/admin_controller')
const HallController = () => import('#controllers/hall_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// User Authentication Routes
router.group(() => {
  router.post('/register', [UserAuthController, 'register'])
  router.post('/login', [UserAuthController, 'login'])
  router.get('/me', [UserAuthController, 'me']).use(middleware.auth())
  router.post('/logout', [UserAuthController, 'logout']).use(middleware.auth())
}).prefix('/api/users')

// Company Authentication Routes
router.group(() => {
  router.post('/register', [CompanyAuthController, 'register'])
  router.post('/login', [CompanyAuthController, 'login'])
  router.get('/me', [CompanyAuthController, 'me']).use(middleware.auth())
  router.post('/logout', [CompanyAuthController, 'logout']).use(middleware.auth())
}).prefix('/api/companies')

// Company Hall Management Routes
router.group(() => {
  router.get('/', [HallController, 'index']).use(middleware.company())
  router.get('/:id', [HallController, 'show']).use(middleware.company())
  router.post('/', [HallController, 'store']).use(middleware.company())
  router.put('/:id', [HallController, 'update']).use(middleware.company())
  router.patch('/:id', [HallController, 'update']).use(middleware.company())
  router.delete('/:id', [HallController, 'destroy']).use(middleware.company())
}).prefix('/api/companies/halls')

// Admin Authentication Routes
router.group(() => {
  router.post('/login', [AdminAuthController, 'login'])
  router.get('/me', [AdminAuthController, 'me']).use(middleware.auth())
  router.post('/logout', [AdminAuthController, 'logout']).use(middleware.auth())
}).prefix('/api/admin')

// Admin Management Routes (all require admin middleware)
router
  .group(() => {
    // Statistics
    router.get('/statistics', [AdminController, 'getStatistics']).use(middleware.admin())

    // Users Management
    router.get('/users', [AdminController, 'getUsers']).use(middleware.admin())
    router.get('/users/:id', [AdminController, 'getUser']).use(middleware.admin())
    router.post('/users/:id/ban', [AdminController, 'banUser']).use(middleware.admin())
    router.post('/users/:id/unban', [AdminController, 'unbanUser']).use(middleware.admin())

    // Companies Management
    router.get('/companies', [AdminController, 'getCompanies']).use(middleware.admin())
    router.get('/companies/:id', [AdminController, 'getCompany']).use(middleware.admin())
    router.post('/companies/:id/ban', [AdminController, 'banCompany']).use(middleware.admin())
    router.post('/companies/:id/unban', [AdminController, 'unbanCompany']).use(middleware.admin())

    // Halls Management
    router.get('/halls', [AdminController, 'getHalls']).use(middleware.admin())
    router.delete('/halls/:id', [AdminController, 'deleteHall']).use(middleware.admin())

    // Bookings Management
    router.get('/bookings', [AdminController, 'getBookings']).use(middleware.admin())
    router.delete('/bookings/:id', [AdminController, 'deleteBooking']).use(middleware.admin())
  })
  .prefix('/api/admin')
