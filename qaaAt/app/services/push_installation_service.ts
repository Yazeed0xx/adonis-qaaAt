import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import Company from '#models/company'
import User from '#models/user'
import PushInstallation from '#models/push_installation'
import AccessDeniedException from '#exceptions/access_denied_exception'

export interface RegisterPushInstallationInput {
  installationId: string
  expoPushToken: string
  platform: 'ios' | 'android'
  deviceName?: string
  appVersion?: string
}

export class PushInstallationService {
  async registerCompany(userId: number, input: RegisterPushInstallationInput) {
    await this.assertEligibleCompany(userId)
    return this.register(userId, input)
  }

  async registerUser(userId: number, input: RegisterPushInstallationInput) {
    await this.assertEligibleUser(userId)
    return this.register(userId, input)
  }

  private async register(userId: number, input: RegisterPushInstallationInput) {
    return db.transaction(async (trx) => {
      for (const lockKey of [
        `installation:${input.installationId}`,
        `token:${input.expoPushToken}`,
      ].sort()) {
        await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtext(?))', [lockKey])
      }

      const now = DateTime.now()
      const existing = await PushInstallation.query({ client: trx })
        .where('installationId', input.installationId)
        .forUpdate()
        .first()

      const tokenQuery = PushInstallation.query({ client: trx })
        .where('expoPushToken', input.expoPushToken)
        .whereNull('revokedAt')
      if (existing) tokenQuery.whereNot('id', String(existing.id))
      await tokenQuery.update({
        notificationsEnabled: false,
        revokedAt: now,
        updatedAt: now,
      })

      if (existing) {
        existing.useTransaction(trx)
        existing.merge({
          userId,
          expoPushToken: input.expoPushToken,
          platform: input.platform,
          deviceName: input.deviceName ?? null,
          appVersion: input.appVersion ?? null,
          notificationsEnabled: true,
          lastSeenAt: now,
          revokedAt: null,
        })
        await existing.save()
        return existing
      }

      return PushInstallation.create(
        {
          userId,
          installationId: input.installationId,
          expoPushToken: input.expoPushToken,
          platform: input.platform,
          deviceName: input.deviceName ?? null,
          appVersion: input.appVersion ?? null,
          notificationsEnabled: true,
          lastSeenAt: now,
          revokedAt: null,
        },
        { client: trx }
      )
    })
  }

  async revoke(userId: number, installationId: string): Promise<void> {
    await PushInstallation.query()
      .where('userId', userId)
      .where('installationId', installationId)
      .update({ notificationsEnabled: false, revokedAt: DateTime.now() })
  }

  async revokeAll(userId: number, client?: QueryClientContract): Promise<void> {
    const queryClient = client ?? db.connection()
    const now = DateTime.now().toSQL()
    await queryClient
      .from('push_installations')
      .where('user_id', userId)
      .whereNull('revoked_at')
      .update({ notifications_enabled: false, revoked_at: now, updated_at: now })
  }

  private async assertEligibleCompany(userId: number): Promise<void> {
    const company = await Company.query()
      .where('userId', userId)
      .whereNull('deletedAt')
      .whereHas('user', (query) => query.whereNull('deletedAt'))
      .first()

    if (!company || company.status === 'suspended') {
      throw new AccessDeniedException('Push registration is unavailable for this company')
    }
  }

  private async assertEligibleUser(userId: number): Promise<void> {
    const user = await User.query()
      .where('id', userId)
      .where('userType', 'user')
      .whereNull('deletedAt')
      .whereNotNull('emailVerifiedAt')
      .first()

    if (!user) {
      throw new AccessDeniedException('Push registration is unavailable for this user')
    }
  }
}

export default new PushInstallationService()
