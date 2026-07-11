import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Space from '#models/space'
import SpaceException from '#exceptions/space_exception'

export class SpaceModerationService {
  async list(status?: string, page = 1, limit = 20) {
    const query = Space.query()
      .whereNull('deletedAt')
      .preload('venue')
      .preload('category')
      .preload('company')
      .orderBy('createdAt', 'asc')
    if (status) query.where('publicationStatus', status)
    return query.paginate(page, limit)
  }
  async show(id: number) {
    return Space.query()
      .where('id', id)
      .preload('venue')
      .preload('category')
      .preload('company')
      .preload('moderationEvents', (query) => query.orderBy('createdAt', 'desc'))
      .firstOrFail()
  }
  publish(id: number, adminId: number) {
    return this.transition(id, adminId, ['pending_review', 'suspended'], 'published', 'published')
  }
  requestChanges(id: number, adminId: number, reason: string) {
    return this.transition(
      id,
      adminId,
      ['pending_review'],
      'changes_requested',
      'changes_requested',
      reason
    )
  }
  suspend(id: number, adminId: number, reason: string) {
    return this.transition(id, adminId, ['published'], 'suspended', 'suspended', reason)
  }

  private async transition(
    id: number,
    adminId: number,
    from: string[],
    next: string,
    action: string,
    reason?: string
  ) {
    return db.transaction(async (trx) => {
      const space = await Space.query({ client: trx })
        .where('id', id)
        .whereNull('deletedAt')
        .forUpdate()
        .firstOrFail()
      if (space.legacyHallId) {
        throw new SpaceException(
          'Mapped legacy moderation remains controlled by the Hall compatibility workflow',
          'LEGACY_SPACE_MODERATION_VIA_HALL',
          409
        )
      }
      if (!from.includes(space.publicationStatus))
        throw new SpaceException('Invalid moderation transition', 'SPACE_MODERATION_INVALID_STATE')
      const previous = space.publicationStatus
      space.useTransaction(trx)
      space.publicationStatus = next
      if (next === 'published') {
        space.publishedAt = DateTime.now()
        space.publishedBy = adminId
      }
      await space.save()
      await trx.table('space_moderation_events').insert({
        space_id: space.id,
        company_id: space.companyId,
        actor_user_id: adminId,
        action,
        previous_status: previous,
        next_status: next,
        reason: reason ?? null,
        created_at: DateTime.now().toSQL(),
      })
      return space
    })
  }
}
