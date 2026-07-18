import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery('CREATE EXTENSION IF NOT EXISTS btree_gist')
  }

  async down() {
    // The extension may be shared by other schemas and is intentionally retained.
  }
}
