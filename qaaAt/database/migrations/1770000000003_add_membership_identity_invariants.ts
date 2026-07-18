import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw('CREATE UNIQUE INDEX users_normalized_email_unique ON users (LOWER(email))')
    this.schema.raw(
      'CREATE UNIQUE INDEX user_profiles_active_phone_unique ON user_profiles (phone) WHERE phone IS NOT NULL AND deleted_at IS NULL'
    )
    this.schema.raw(
      "CREATE UNIQUE INDEX company_memberships_one_current_per_user_unique ON company_memberships (user_id) WHERE status IN ('active', 'suspended')"
    )
    this.schema.raw(
      "CREATE UNIQUE INDEX company_invitations_pending_email_unique ON company_invitations (invited_email) WHERE status = 'pending' AND invited_email IS NOT NULL"
    )
    this.schema.raw(
      "CREATE UNIQUE INDEX company_invitations_pending_phone_unique ON company_invitations (invited_phone) WHERE status = 'pending' AND invited_phone IS NOT NULL"
    )
  }

  async down() {
    this.schema.raw('DROP INDEX IF EXISTS company_invitations_pending_phone_unique')
    this.schema.raw('DROP INDEX IF EXISTS company_invitations_pending_email_unique')
    this.schema.raw('DROP INDEX IF EXISTS company_memberships_one_current_per_user_unique')
    this.schema.raw('DROP INDEX IF EXISTS user_profiles_active_phone_unique')
    this.schema.raw('DROP INDEX IF EXISTS users_normalized_email_unique')
  }
}
