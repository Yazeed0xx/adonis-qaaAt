import sharp from 'sharp'
import { createSpaceScenario } from '#tests/support/scenarios/spaces'

export const tinyPng = await sharp({
  create: { width: 2, height: 2, channels: 3, background: 'blue' },
})
  .png()
  .toBuffer()

export async function createMediaScenario() {
  const scenario = await createSpaceScenario({
    space: {
      nameEn: 'Media Space',
      bookingMode: 'quote_required',
      capacityTotal: 10,
    },
  })

  return {
    owner: scenario.user,
    company: scenario.company,
    membership: scenario.membership,
    spaceId: scenario.space.id,
    venueId: scenario.venue.id,
  }
}
