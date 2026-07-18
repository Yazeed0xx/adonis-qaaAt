import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import SpaceMediaException from '#exceptions/space_media_exception'
import { SpaceMediaStorageService } from '#services/space_media_storage_service'
import { VerifiedImageService } from '#services/verified_image_service'

type AltInput = { altTextAr?: string | null; altTextEn?: string | null }

export class SpaceMediaService {
  constructor(
    private storage = new SpaceMediaStorageService(),
    private images = new VerifiedImageService()
  ) {}

  private async lockSpace(trx: TransactionClientContract, companyId: number, spaceId: number) {
    const space = await trx
      .from('spaces')
      .where({ id: spaceId, company_id: companyId })
      .whereNull('deleted_at')
      .forUpdate()
      .first()
    if (!space)
      throw new SpaceMediaException('Space media was not found', 'SPACE_MEDIA_NOT_FOUND', 404)
    if (['suspended', 'archived'].includes(space.publication_status))
      throw new SpaceMediaException(
        'Space media cannot be changed in its current state',
        'SPACE_MEDIA_STATE_INVALID',
        409
      )
    return space
  }

  async upload(
    companyId: number,
    spaceId: number,
    actorUserId: number,
    bytes: Uint8Array,
    input: AltInput
  ) {
    if (bytes.byteLength > 10 * 1024 * 1024)
      throw new SpaceMediaException('Image exceeds the 10 MB limit', 'SPACE_MEDIA_TOO_LARGE', 413)
    const verified = await this.images.verify(bytes)
    const key = this.storage.key(companyId, spaceId, verified.extension)
    await this.storage.put(key, bytes)
    try {
      const id = await db.transaction(async (trx) => {
        await this.lockSpace(trx, companyId, spaceId)
        const count = await trx
          .from('space_media')
          .where('space_id', spaceId)
          .whereNull('deleted_at')
          .count('* as total')
          .first()
        if (Number(count?.total) >= 20)
          throw new SpaceMediaException(
            'A Space may contain at most 20 controlled images',
            'SPACE_MEDIA_LIMIT_REACHED',
            409
          )
        const last = await trx
          .from('space_media')
          .where({ space_id: spaceId })
          .whereNull('deleted_at')
          .max('sort_order as maximum')
          .first()
        const [media] = await trx
          .table('space_media')
          .insert({
            space_id: spaceId,
            media_type: 'image',
            storage_key: key,
            mime_type: verified.mime,
            byte_size: bytes.byteLength,
            width: verified.width,
            height: verified.height,
            alt_text_ar: input.altTextAr ?? null,
            alt_text_en: input.altTextEn ?? null,
            sort_order: Number(last?.maximum ?? -1) + 1,
            is_cover: false,
            moderation_status: 'pending',
            created_at: DateTime.now().toSQL(),
          })
          .returning('*')
        await this.audit(trx, media, companyId, actorUserId, 'uploaded', null, 'pending')
        return media.id
      })
      return this.findOwned(companyId, spaceId, id)
    } catch (error) {
      await this.storage.delete(key).catch(() => {})
      throw error
    }
  }

  async list(companyId: number, spaceId: number) {
    await this.assertOwnedSpace(companyId, spaceId)
    return db
      .from('space_media')
      .where('space_id', spaceId)
      .whereNull('deleted_at')
      .orderBy('sort_order')
      .orderBy('id')
  }

  async update(
    companyId: number,
    spaceId: number,
    mediaId: number,
    actorUserId: number,
    input: AltInput
  ) {
    return db.transaction(async (trx) => {
      await this.lockSpace(trx, companyId, spaceId)
      const media = await this.findOwned(companyId, spaceId, mediaId, trx, true)
      await trx
        .from('space_media')
        .where('id', mediaId)
        .update({
          alt_text_ar: input.altTextAr ?? null,
          alt_text_en: input.altTextEn ?? null,
          updated_at: DateTime.now().toSQL(),
        })
      await this.audit(
        trx,
        media,
        companyId,
        actorUserId,
        'metadata_updated',
        media.moderation_status,
        media.moderation_status
      )
      return this.findOwned(companyId, spaceId, mediaId, trx)
    })
  }

  async reorder(companyId: number, spaceId: number, actorUserId: number, ids: number[]) {
    return db.transaction(async (trx) => {
      await this.lockSpace(trx, companyId, spaceId)
      const rows = await trx
        .from('space_media')
        .where('space_id', spaceId)
        .whereNull('deleted_at')
        .orderBy('id')
        .forUpdate()
      if (
        new Set(ids).size !== ids.length ||
        rows.length !== ids.length ||
        rows.some((r) => !ids.includes(r.id))
      )
        throw new SpaceMediaException(
          'Ordering must contain every controlled media ID exactly once',
          'SPACE_MEDIA_FORBIDDEN',
          403
        )
      for (const [sortOrder, id] of ids.entries())
        await trx
          .from('space_media')
          .where({ id, space_id: spaceId })
          .update({ sort_order: sortOrder, updated_at: DateTime.now().toSQL() })
      if (rows[0])
        await this.audit(
          trx,
          rows[0],
          companyId,
          actorUserId,
          'reordered',
          rows[0].moderation_status,
          rows[0].moderation_status,
          undefined,
          { mediaIds: ids }
        )
      return trx.from('space_media').whereIn('id', ids).orderBy('sort_order')
    })
  }

  async cover(companyId: number, spaceId: number, mediaId: number, actorUserId: number) {
    return db.transaction(async (trx) => {
      await this.lockSpace(trx, companyId, spaceId)
      const media = await this.findOwned(companyId, spaceId, mediaId, trx, true)
      if (media.moderation_status !== 'approved')
        throw new SpaceMediaException(
          'Only approved controlled images may be covers',
          'SPACE_MEDIA_STATE_INVALID',
          409
        )
      await trx
        .from('space_media')
        .where({ space_id: spaceId, is_cover: true })
        .whereNull('deleted_at')
        .update({ is_cover: false, updated_at: DateTime.now().toSQL() })
      await trx
        .from('space_media')
        .where('id', mediaId)
        .update({ is_cover: true, updated_at: DateTime.now().toSQL() })
      await this.audit(trx, media, companyId, actorUserId, 'cover_selected', 'approved', 'approved')
      return this.findOwned(companyId, spaceId, mediaId, trx)
    })
  }

  async delete(
    companyId: number,
    spaceId: number,
    mediaId: number,
    actorUserId: number,
    attemptImmediateCleanup = true
  ) {
    const cleanupId = await db.transaction(async (trx) => {
      await this.lockSpace(trx, companyId, spaceId)
      const target = await this.findOwned(companyId, spaceId, mediaId, trx, true)
      await trx.from('space_media').where('id', mediaId).update({
        is_cover: false,
        deleted_at: DateTime.now().toSQL(),
        updated_at: DateTime.now().toSQL(),
      })
      if (target.is_cover) {
        const next = await trx
          .from('space_media')
          .where({
            space_id: spaceId,
            moderation_status: 'approved',
          })
          .whereNull('deleted_at')
          .orderBy('sort_order')
          .orderBy('id')
          .forUpdate()
          .first()
        if (next)
          await trx
            .from('space_media')
            .where('id', next.id)
            .update({ is_cover: true, updated_at: DateTime.now().toSQL() })
      }
      await this.audit(
        trx,
        target,
        companyId,
        actorUserId,
        'deleted',
        target.moderation_status,
        target.moderation_status
      )
      const [cleanup] = await trx
        .table('space_media_cleanup_outbox')
        .insert({
          space_media_id: target.id,
          storage_key: target.storage_key,
          attempts: 0,
          available_at: DateTime.now().toSQL(),
          created_at: DateTime.now().toSQL(),
        })
        .onConflict('storage_key')
        .merge(['space_media_id', 'available_at'])
        .returning('id')
      return cleanup.id as number
    })
    if (attemptImmediateCleanup) await this.processCleanup(1, cleanupId)
  }

  async pending(page: number, limit: number) {
    return db
      .from('space_media as sm')
      .join('spaces as s', 's.id', 'sm.space_id')
      .join('venues as v', 'v.id', 's.venue_id')
      .join('companies as c', 'c.id', 's.company_id')
      .where('sm.moderation_status', 'pending')
      .whereNull('sm.deleted_at')
      .select(
        'sm.*',
        's.company_id',
        's.name_ar as space_name_ar',
        's.name_en as space_name_en',
        'v.name_ar as venue_name_ar',
        'v.name_en as venue_name_en',
        'c.status as company_status'
      )
      .orderBy('sm.created_at')
      .paginate(page, limit)
  }

  async adminShow(mediaId: number) {
    const row = await db
      .from('space_media as sm')
      .join('spaces as s', 's.id', 'sm.space_id')
      .join('venues as v', 'v.id', 's.venue_id')
      .join('companies as c', 'c.id', 's.company_id')
      .where('sm.id', mediaId)
      .whereNull('sm.deleted_at')
      .select(
        'sm.*',
        's.company_id',
        's.name_ar as space_name_ar',
        's.name_en as space_name_en',
        'v.name_ar as venue_name_ar',
        'v.name_en as venue_name_en',
        'c.status as company_status'
      )
      .first()
    if (!row)
      throw new SpaceMediaException('Space media was not found', 'SPACE_MEDIA_NOT_FOUND', 404)
    return row
  }

  async moderate(
    mediaId: number,
    actorUserId: number,
    next: 'approved' | 'rejected',
    reason?: string
  ) {
    return db
      .transaction(async (trx) => {
        const media = await trx
          .from('space_media')
          .where('id', mediaId)
          .whereNull('deleted_at')
          .forUpdate()
          .first()
        if (!media)
          throw new SpaceMediaException('Space media was not found', 'SPACE_MEDIA_NOT_FOUND', 404)
        if (media.moderation_status !== 'pending')
          throw new SpaceMediaException(
            'Media moderation transition is invalid',
            'SPACE_MEDIA_STATE_INVALID',
            409
          )
        const space = await trx.from('spaces').where('id', media.space_id).forUpdate().firstOrFail()
        await trx
          .from('space_media')
          .where('id', mediaId)
          .update({ moderation_status: next, updated_at: DateTime.now().toSQL() })
        await this.audit(trx, media, space.company_id, actorUserId, next, 'pending', next, reason)
        await this.adminShowWithClient(mediaId, trx)
        return mediaId
      })
      .then((id) => this.adminShow(id))
  }

  async publicContent(mediaId: number) {
    const row = await db
      .from('space_media as sm')
      .join('spaces as s', 's.id', 'sm.space_id')
      .join('venues as v', 'v.id', 's.venue_id')
      .join('companies as c', 'c.id', 's.company_id')
      .where('sm.id', mediaId)
      .where({
        'sm.moderation_status': 'approved',
        's.publication_status': 'published',
        'c.status': 'approved',
      })
      .whereNull('sm.deleted_at')
      .whereNull('s.deleted_at')
      .whereNull('v.deleted_at')
      .whereNull('c.deleted_at')
      .select('sm.*')
      .first()
    if (!row || !(await this.storage.exists(row.storage_key)))
      throw new SpaceMediaException('Space media was not found', 'SPACE_MEDIA_NOT_FOUND', 404)
    return { row, stream: await this.storage.stream(row.storage_key) }
  }

  async companyContent(companyId: number, spaceId: number, mediaId: number) {
    const row = await this.findOwned(companyId, spaceId, mediaId)
    if (!(await this.storage.exists(row.storage_key)))
      throw new SpaceMediaException('Space media was not found', 'SPACE_MEDIA_NOT_FOUND', 404)
    return { row, stream: await this.storage.stream(row.storage_key) }
  }
  async adminContent(mediaId: number) {
    const row = await this.adminShow(mediaId)
    if (!(await this.storage.exists(row.storage_key)))
      throw new SpaceMediaException('Space media was not found', 'SPACE_MEDIA_NOT_FOUND', 404)
    return { row, stream: await this.storage.stream(row.storage_key) }
  }

  async processCleanup(limit = 50, cleanupId?: number) {
    let processed = 0
    const maximum = Math.min(Math.max(limit, 1), 100)
    for (let index = 0; index < maximum; index++) {
      const claimed = await db.transaction(async (trx) => {
        const query = trx
          .from('space_media_cleanup_outbox as cleanup')
          .join('space_media as media', 'media.id', 'cleanup.space_media_id')
          .join('spaces as space', 'space.id', 'media.space_id')
          .whereNull('cleanup.processed_at')
          .where('cleanup.available_at', '<=', DateTime.now().toSQL())
          .whereRaw('cleanup.storage_key = media.storage_key')
          .whereRaw(
            "cleanup.storage_key LIKE 'spaces/' || space.company_id || '/' || media.space_id || '/%'"
          )
          .select('cleanup.*')
          .orderBy('cleanup.id')
          .forUpdate()
          .skipLocked()
        if (cleanupId) query.where('cleanup.id', cleanupId)
        const row = await query.first()
        if (!row) return false
        try {
          await this.storage.delete(row.storage_key)
          await trx
            .from('space_media_cleanup_outbox')
            .where('id', row.id)
            .update({
              processed_at: DateTime.now().toSQL(),
              attempts: row.attempts + 1,
              last_error: null,
            })
        } catch (error) {
          await trx
            .from('space_media_cleanup_outbox')
            .where('id', row.id)
            .update({
              attempts: row.attempts + 1,
              available_at: DateTime.now()
                .plus({ minutes: Math.min(60, 2 ** Math.min(row.attempts, 5)) })
                .toSQL(),
              last_error: String(error).slice(0, 2000),
            })
        }
        return true
      })
      if (!claimed) break
      processed++
      if (cleanupId) break
    }
    return processed
  }

  private async assertOwnedSpace(companyId: number, spaceId: number) {
    const row = await db
      .from('spaces')
      .where({ id: spaceId, company_id: companyId })
      .whereNull('deleted_at')
      .first()
    if (!row)
      throw new SpaceMediaException('Space media was not found', 'SPACE_MEDIA_NOT_FOUND', 404)
  }
  private async findOwned(
    companyId: number,
    spaceId: number,
    mediaId: number,
    client: any = db,
    lock = false
  ) {
    let q = client
      .from('space_media as sm')
      .join('spaces as s', 's.id', 'sm.space_id')
      .where({
        'sm.id': mediaId,
        'sm.space_id': spaceId,
        's.company_id': companyId,
      })
      .whereNull('sm.deleted_at')
      .select('sm.*')
    if (lock) q = q.forUpdate()
    const row = await q.first()
    if (!row)
      throw new SpaceMediaException('Space media was not found', 'SPACE_MEDIA_NOT_FOUND', 404)
    return row
  }
  private adminShowWithClient(mediaId: number, client: any) {
    return client.from('space_media').where('id', mediaId).firstOrFail()
  }
  private audit(
    trx: TransactionClientContract,
    media: any,
    companyId: number,
    actorUserId: number,
    action: string,
    previousStatus: string | null,
    nextStatus: string | null,
    reason?: string,
    metadata?: unknown
  ) {
    return trx.table('space_media_events').insert({
      space_media_id: media.id,
      space_id: media.space_id,
      company_id: companyId,
      actor_user_id: actorUserId,
      action,
      previous_status: previousStatus,
      next_status: nextStatus,
      reason: reason ?? null,
      metadata: metadata ?? null,
      created_at: DateTime.now().toSQL(),
    })
  }
}
