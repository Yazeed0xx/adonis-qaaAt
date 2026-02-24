import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { UserFactory } from '#database/factories/user_factory'
import { CompanyFactory } from '#database/factories/company_factory'

export default class extends BaseSeeder {
  async run() {
    await UserFactory.createMany(10)
    await CompanyFactory.createMany(10)
    // Write your database queries inside the run method
  }
}
