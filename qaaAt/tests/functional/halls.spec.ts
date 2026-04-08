import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Hall from '#models/hall'
import { CompanyFactory } from '#database/factories/company_factory'
import { HallFactory } from '#database/factories/hall_factory'

test.group('Hall endpoints', (group) => {
  group.each.setup(() => testUtils.db().truncate())

  test('serve OpenAPI json with hall schemas', async ({ client }) => {
    const response = await client.get('/api.json')

    response.assertStatus(200)
    response.assertBodyContains({
      components: {
        schemas: {
          HallPaginatedResponseSchema: {},
          HallResourceResponseSchema: {},
          HallMutationResponseSchema: {},
        },
      },
    })
  })

  test('list public halls', async ({ client }) => {
    const company = await CompanyFactory.apply('approved')
      .with('user', 1, (user) => user.apply('company', 'verified'))
      .with('companyProfile')
      .create()

    await HallFactory.merge({
      companyId: company.id,
      name: 'Royal Grand Hall',
      city: 'Riyadh',
      pricing: '5000',
      isAvailable: true,
    }).create()

    const response = await client.get('/api/halls?limit=1&page=1')

    response.assertStatus(200)
    response.assertBodyContains({
      data: [
        {
          name: 'Royal Grand Hall',
          city: 'Riyadh',
          pricing: 5000,
        },
      ],
    })
  })

  test('show public hall details', async ({ client }) => {
    const company = await CompanyFactory.apply('approved')
      .with('user', 1, (user) => user.apply('company', 'verified'))
      .with('companyProfile')
      .create()

    const hall = await HallFactory.merge({
      companyId: company.id,
      name: 'Golden Ballroom',
      city: 'Jeddah',
      pricing: '4500',
      isAvailable: true,
    }).create()

    const response = await client.get(`/api/halls/${hall.id}`)

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        id: hall.id,
        name: 'Golden Ballroom',
        city: 'Jeddah',
        pricing: 4500,
      },
    })
  })

  test('list company halls for authenticated company', async ({ client }) => {
    const company = await CompanyFactory.apply('approved')
      .with('user', 1, (user) => user.apply('company', 'verified'))
      .with('companyProfile')
      .create()

    await HallFactory.merge({
      companyId: company.id,
      name: 'Company Private Hall',
      pricing: '3500',
    }).create()

    const user = await company.related('user').query().firstOrFail()

    const response = await client
      .get('/api/companies/halls?limit=1&page=1')
      .withGuard('api')
      .loginAs(user)

    response.assertStatus(200)
    response.assertBodyContains({
      data: [
        {
          name: 'Company Private Hall',
          pricing: 3500,
        },
      ],
    })
  })

  test('create hall for authenticated approved company', async ({ client }) => {
    const company = await CompanyFactory.apply('approved')
      .with('user', 1, (user) => user.apply('company', 'verified'))
      .with('companyProfile')
      .create()

    const user = await company.related('user').query().firstOrFail()

    const response = await client
      .post('/api/companies/halls')
      .withGuard('api')
      .loginAs(user)
      .json({
        name: 'New Production Hall',
        description: 'Large hall for events',
        capacity: 300,
        location: 'Al Olaya District',
        amenities: { parking: true },
        pricing: 6000,
        images: ['https://example.com/hall.jpg'],
        address: '123 King Fahd Road',
        city: 'Riyadh',
        services: ['parking'],
        isAvailable: true,
      })

    response.assertStatus(201)
    response.assertBodyContains({
      message: 'Hall created successfully',
      data: {
        name: 'New Production Hall',
        pricing: 6000,
      },
    })

    const hall = await Hall.findByOrFail('name', 'New Production Hall')
    response.assertBodyContains({ data: { id: hall.id } })
  })
})
