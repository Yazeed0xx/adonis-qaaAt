import { HallFactory } from '#database/factories/hall_factory'
import { ServiceFactory } from '#database/factories/service_factory'
import type { DemoScenarioContext } from '#database/seeding/scenario_context'

export async function seedInventory(context: DemoScenarioContext) {
  const royal = context.companies.royal
  const golden = context.companies.golden
  if (!royal || !golden) throw new Error('Companies must be seeded before inventory')

  const halls = await HallFactory.merge([
    {
      companyId: royal.id,
      name: 'Royal Grand Hall',
      description:
        'Our flagship venue featuring stunning crystal chandeliers, marble floors, and capacity for 500 guests. Perfect for grand weddings and large celebrations.',
      capacity: 500,
      location: 'Al Olaya District',
      pricing: '5000',
      images: [
        'https://picsum.photos/seed/hall1a/800/600',
        'https://picsum.photos/seed/hall1b/800/600',
        'https://picsum.photos/seed/hall1c/800/600',
      ],
      address: '123 King Fahd Road',
      city: 'Riyadh',
      amenities: { parking: true, wifi: true, catering: true, sound_system: true, stage: true, bridal_suite: true },
      services: ['free valet parking', 'complimentary sweets & coffee', 'setup & cleanup', 'bridal suite access'],
      isAvailable: true,
    },
    {
      companyId: royal.id,
      name: 'Royal Garden',
      description: 'Beautiful outdoor venue with landscaped gardens. Ideal for intimate gatherings and garden parties.',
      capacity: 150,
      location: 'Al Olaya District',
      pricing: '2500',
      images: ['https://picsum.photos/seed/hall2a/800/600', 'https://picsum.photos/seed/hall2b/800/600'],
      address: '123 King Fahd Road',
      city: 'Riyadh',
      amenities: { parking: true, wifi: true, outdoor_area: true },
      services: ['free parking', 'complimentary tea & coffee'],
      isAvailable: true,
    },
    {
      companyId: royal.id,
      name: 'Royal Conference Center',
      description:
        'Modern conference facility with state-of-the-art AV equipment. Perfect for business meetings and corporate events.',
      capacity: 200,
      location: 'Al Olaya District',
      pricing: '3000',
      images: ['https://picsum.photos/seed/hall3a/800/600'],
      address: '123 King Fahd Road',
      city: 'Riyadh',
      amenities: { parking: true, wifi: true, projector: true, video_conferencing: true },
      services: ['free parking', 'complimentary water & coffee', 'technical support'],
      isAvailable: true,
    },
    {
      companyId: golden.id,
      name: 'Golden Ballroom',
      description:
        'Luxurious ballroom with golden accents and panoramic city views. The premier venue for high-end events in Jeddah.',
      capacity: 400,
      location: 'Al Hamra District',
      pricing: '4500',
      images: ['https://picsum.photos/seed/hall4a/800/600', 'https://picsum.photos/seed/hall4b/800/600'],
      address: '456 Prince Sultan Street',
      city: 'Jeddah',
      amenities: { parking: true, wifi: true, catering: true, sound_system: true, sea_view: true },
      services: ['free valet parking', 'complimentary dinner buffet', 'free sweets & Arabic coffee', 'setup & cleanup'],
      isAvailable: true,
    },
    {
      companyId: golden.id,
      name: 'Pearl Hall',
      description: 'Elegant medium-sized hall with modern amenities. Great for graduation parties and corporate events.',
      capacity: 250,
      location: 'Al Hamra District',
      pricing: '3500',
      images: ['https://picsum.photos/seed/hall5a/800/600'],
      address: '456 Prince Sultan Street',
      city: 'Jeddah',
      amenities: { parking: true, wifi: true, catering: true },
      services: ['free parking', 'complimentary sweets & coffee'],
      isAvailable: true,
    },
    {
      companyId: golden.id,
      name: 'Sunset Terrace',
      description: 'Rooftop venue with breathtaking sunset views over the Red Sea. Currently under renovation.',
      capacity: 100,
      location: 'Al Hamra District',
      pricing: '2000',
      images: ['https://picsum.photos/seed/hall6a/800/600'],
      address: '456 Prince Sultan Street',
      city: 'Jeddah',
      amenities: { outdoor_area: true, sea_view: true },
      services: ['free parking'],
      isAvailable: false,
    },
  ]).createMany(6)

  const services = await ServiceFactory.merge([
    { companyId: royal.id, name: 'Premium Decoration', description: 'Luxury floral arrangements and themed decorations', price: '5000' },
    { companyId: royal.id, name: 'Photography Package', description: 'Professional photography with 500+ edited photos', price: '4000' },
    { companyId: royal.id, name: 'Video Coverage', description: 'Full HD video coverage with drone shots', price: '3500' },
    { companyId: royal.id, name: 'Catering - Standard', description: 'Buffet for up to 200 guests', price: '8000' },
    { companyId: royal.id, name: 'Catering - Premium', description: 'Gourmet buffet for up to 200 guests', price: '15000' },
    { companyId: golden.id, name: 'Decoration Package', description: 'Beautiful floral and lighting arrangements', price: '4000' },
    { companyId: golden.id, name: 'Photo & Video Bundle', description: 'Complete media coverage package', price: '6000' },
    { companyId: golden.id, name: 'Live Music', description: 'Traditional Arabic music ensemble', price: '5000' },
  ]).createMany(8)

  ;[
    context.halls.royalGrand,
    context.halls.royalGarden,
    context.halls.royalConference,
    context.halls.goldenBallroom,
    context.halls.pearlHall,
    context.halls.sunsetTerrace,
  ] = halls

  ;[
    context.services.royalDecoration,
    context.services.royalPhotography,
    context.services.royalVideo,
    context.services.royalCateringStandard,
    context.services.royalCateringPremium,
    context.services.goldenDecoration,
    context.services.goldenPhotoVideo,
    context.services.goldenLiveMusic,
  ] = services
}
