import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export interface CompanyAccessRevocationResult {
  revokedPushInstallations: number
  revokedTokens: number
}

export class CompanyAccessRevocationService {
  async revoke(
    trx: TransactionClientContract,
    companyId: number,
    userIds: number[]
  ): Promise<CompanyAccessRevocationResult> {
    if (userIds.length === 0) {
      return { revokedPushInstallations: 0, revokedTokens: 0 }
    }

    const tokens = await trx
      .from('auth_access_tokens')
      .whereIn('tokenable_id', userIds)
      .select('id', 'tokenable_id', 'abilities')
    const tokenIds = tokens
      .filter((token) => this.belongsToCompany(token.abilities, companyId))
      .map((token) => token.id)

    if (tokenIds.length > 0) {
      await trx.from('auth_access_tokens').whereIn('id', tokenIds).delete()
    }

    const now = new Date()
    const pushInstallations = await trx
      .from('push_installations')
      .whereIn('user_id', userIds)
      .where('client_context', 'company_app')
      .whereNull('revoked_at')
      .select('id')
    const pushInstallationIds = pushInstallations.map((installation) => installation.id)
    if (pushInstallationIds.length > 0) {
      await trx
        .from('push_installations')
        .whereIn('id', pushInstallationIds)
        .update({ notifications_enabled: false, revoked_at: now, updated_at: now })
    }

    return {
      revokedPushInstallations: pushInstallationIds.length,
      revokedTokens: tokenIds.length,
    }
  }

  private belongsToCompany(rawAbilities: unknown, companyId: number): boolean {
    try {
      const abilities = typeof rawAbilities === 'string' ? JSON.parse(rawAbilities) : rawAbilities
      return (
        Array.isArray(abilities) &&
        abilities.includes('client:company_app') &&
        abilities.includes(`company:${companyId}`)
      )
    } catch {
      return false
    }
  }
}
