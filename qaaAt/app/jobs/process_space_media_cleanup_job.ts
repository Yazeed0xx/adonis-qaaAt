import { inject } from '@adonisjs/core'
import { Job } from '@adonisjs/queue'
import type { JobOptions } from '@adonisjs/queue/types'
import { SpaceMediaService } from '#services/space_media_service'

@inject()
export default class ProcessSpaceMediaCleanupJob extends Job<Record<string, never>> {
  static options: JobOptions = { queue: 'default', maxRetries: 1, timeout: '2m' }
  constructor(private media: SpaceMediaService) {
    super()
  }
  async execute() {
    await this.media.processCleanup()
  }
}
