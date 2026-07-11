import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      INSERT INTO company_memberships (company_id, user_id, role, status, joined_at, created_at)
      SELECT id, user_id, 'owner', 'active', created_at, NOW()
      FROM companies
      ON CONFLICT (company_id, user_id) DO NOTHING
    `)
  }

  async down() {
    // Deliberately retain memberships: they may have changed after the backfill.
  }
}
