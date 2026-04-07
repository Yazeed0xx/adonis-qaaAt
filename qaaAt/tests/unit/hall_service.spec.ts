import { test } from '@japa/runner'
import { HallService } from '#services/hall_service'
import Hall from '#models/hall'
import Company from '#models/company'
import User from '#models/user'
import testUtils from '@adonisjs/core/services/test_utils'

test.group('Hall Service', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('getCompanyByUserId should return company for valid user', async ({ assert }) => {
    // Create a user
    const user = await User.create({
      email: 'company@test.com',
      password: 'password123',
      userType: 'company',
    })

    // Create a company
    const company = await Company.create({
      userId: user.id,
      city: 'Test City',
    })

    const hallService = new HallService()
    const result = await hallService.getCompanyByUserId(user.id)

    assert.equal(result.id, company.id)
    assert.equal(result.userId, user.id)
  })

  test('getCompanyByUserId should throw error for invalid user', async ({ assert }) => {
    const hallService = new HallService()

    await assert.rejects(() => hallService.getCompanyByUserId(99999), 'Row not found')
  })

  test('getAllHalls should return paginated halls for a company', async ({ assert }) => {
    // Create user and company
    const user = await User.create({
      email: 'company2@test.com',
      password: 'password123',
      userType: 'company',
    })

    const company = await Company.create({
      userId: user.id,
      city: 'Test City',
    })

    // Create multiple halls
    await Hall.createMany([
      {
        name: 'Hall 1',
        capacity: 100,
        location: 'Location 1',
        pricing: '5000',
        address: 'Address 1',
        city: 'City 1',
        companyId: company.id,
        services: ['Service 1', 'Service 2', 'Service 3'],
      },
      {
        name: 'Hall 2',
        capacity: 200,
        location: 'Location 2',
        pricing: '10000',
        address: 'Address 2',
        city: 'City 2',
        companyId: company.id,
      },
    ])

    const hallService = new HallService()
    const result = await hallService.getAllHalls(company.id, 1, 10)

    assert.equal(result.length, 2)
    assert.exists(result[0].id)
    assert.equal(result[0].name, 'Hall 2') // Should be ordered by createdAt desc
  })

  test('getAllHalls should return empty array for company with no halls', async ({ assert }) => {
    const user = await User.create({
      email: 'company3@test.com',
      password: 'password123',
      userType: 'company',
    })

    const company = await Company.create({
      userId: user.id,
      city: 'Test City',
    })

    const hallService = new HallService()
    const result = await hallService.getAllHalls(company.id)

    assert.equal(result.length, 0)
  })

  test('getHallById should return hall with bookings for valid hall', async ({ assert }) => {
    const user = await User.create({
      email: 'company4@test.com',
      password: 'password123',
      userType: 'company',
    })

    const company = await Company.create({
      userId: user.id,
      city: 'Test City',
    })

    const hall = await Hall.create({
      name: 'Test Hall',
      capacity: 150,
      location: 'Test Location',
      pricing: '7500',
      address: 'Test Address',
      city: 'Test City',
      companyId: company.id,
    })

    const hallService = new HallService()
    const result = await hallService.getHallById(hall.id, company.id)

    assert.equal(result.id, hall.id)
    assert.equal(result.name, 'Test Hall')
    assert.exists(result.bookings)
  })

  test('getHallById should throw error for invalid hall', async ({ assert }) => {
    const user = await User.create({
      email: 'company5@test.com',
      password: 'password123',
      userType: 'company',
    })

    const company = await Company.create({
      userId: user.id,
      city: 'Test City',
    })

    const hallService = new HallService()

    await assert.rejects(() => hallService.getHallById(99999, company.id), 'Row not found')
  })

  test('getHallById should throw error for hall belonging to different company', async ({
    assert,
  }) => {
    // Create two companies
    const user1 = await User.create({
      email: 'company6@test.com',
      password: 'password123',
      userType: 'company',
    })

    const user2 = await User.create({
      email: 'company7@test.com',
      password: 'password123',
      userType: 'company',
    })

    const company1 = await Company.create({
      userId: user1.id,
      city: 'Test City',
    })

    const company2 = await Company.create({
      userId: user2.id,
      city: 'Test City',
    })

    const hall = await Hall.create({
      name: 'Test Hall',
      capacity: 150,
      location: 'Test Location',
      pricing: '7500',
      address: 'Test Address',
      city: 'Test City',
      companyId: company1.id,
    })

    const hallService = new HallService()

    await assert.rejects(() => hallService.getHallById(hall.id, company2.id), 'Row not found')
  })

  test('createHall should create a new hall', async ({ assert }) => {
    const user = await User.create({
      email: 'company8@test.com',
      password: 'password123',
      userType: 'company',
    })

    const company = await Company.create({
      userId: user.id,
      city: 'Test City',
    })

    const hallService = new HallService()
    const hallData = {
      name: 'New Hall',
      capacity: 200,
      location: 'New Location',
      pricing: 10000,
      address: 'New Address',
      city: 'New City',
      description: 'A beautiful hall',
      isAvailable: true,
    }

    const result = await hallService.createHall(company.id, hallData)

    assert.equal(result.name, 'New Hall')
    assert.equal(result.capacity, 200)
    assert.equal(result.companyId, company.id)
    assert.equal(result.isAvailable, true)
  })

  test('createHall should default isAvailable to true if not provided', async ({ assert }) => {
    const user = await User.create({
      email: 'company9@test.com',
      password: 'password123',
      userType: 'company',
    })

    const company = await Company.create({
      userId: user.id,
      city: 'Test City',
    })

    const hallService = new HallService()
    const hallData = {
      name: 'New Hall',
      capacity: 200,
      location: 'New Location',
      pricing: 10000,
      address: 'New Address',
      city: 'New City',
    }

    const result = await hallService.createHall(company.id, hallData)

    assert.equal(result.isAvailable, true)
  })

  test('updateHall should update hall successfully', async ({ assert }) => {
    const user = await User.create({
      email: 'company10@test.com',
      password: 'password123',
      userType: 'company',
    })

    const company = await Company.create({
      userId: user.id,
      city: 'Test City',
    })

    const hall = await Hall.create({
      name: 'Original Hall',
      capacity: 100,
      location: 'Original Location',
      pricing: '5000',
      address: 'Original Address',
      city: 'Original City',
      companyId: company.id,
    })

    const hallService = new HallService()
    const updateData = {
      name: 'Updated Hall',
      capacity: 150,
      pricing: 7500,
    }

    const result = await hallService.updateHall(hall.id, company.id, updateData)

    assert.equal(result.name, 'Updated Hall')
    assert.equal(result.capacity, 150)
    assert.equal(result.pricing, '7500')
    // Other fields should remain unchanged
    assert.equal(result.location, 'Original Location')
  })

  test('updateHall should throw error for invalid hall', async ({ assert }) => {
    const user = await User.create({
      email: 'company11@test.com',
      password: 'password123',
      userType: 'company',
    })

    const company = await Company.create({
      userId: user.id,
      city: 'Test City',
    })

    const hallService = new HallService()

    await assert.rejects(
      () => hallService.updateHall(99999, company.id, { name: 'Updated' }),
      'Row not found'
    )
  })

  test('deleteHall should delete hall successfully', async ({ assert }) => {
    const user = await User.create({
      email: 'company12@test.com',
      password: 'password123',
      userType: 'company',
    })

    const company = await Company.create({
      userId: user.id,
      city: 'Test City',
    })

    const hall = await Hall.create({
      name: 'Hall to Delete',
      capacity: 100,
      location: 'Location',
      pricing: '5000',
      address: 'Address',
      city: 'City',
      companyId: company.id,
    })

    const hallService = new HallService()
    await hallService.deleteHall(hall.id, company.id)

    // Check hall is soft deleted
    const deletedHall = await Hall.find(hall.id)
    assert.isNull(deletedHall)
  })

  test('deleteHall should throw error for invalid hall', async ({ assert }) => {
    const user = await User.create({
      email: 'company13@test.com',
      password: 'password123',
      userType: 'company',
    })

    const company = await Company.create({
      userId: user.id,
      city: 'Test City',
    })

    const hallService = new HallService()

    await assert.rejects(() => hallService.deleteHall(99999, company.id), 'Row not found')
  })
})
