import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import ace from '@adonisjs/core/services/ace'

export default class MakeResource extends BaseCommand {
  static commandName = 'make:resource'
  static description = 'Create controller, service, model, migration, validator, and transformer'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'Name of the resource' })
  declare name: string

  async run() {
    await ace.boot()

    await ace.exec('make:controller', [this.name, '--api'])
    await ace.exec('make:service', [this.name])
    await ace.exec('make:model', [this.name])
    await ace.exec('make:migration', [`create_${this.name.toLowerCase()}s_table`])
    await ace.exec('make:validator', [this.name, '--resource'])
    await ace.exec('make:transformer', [this.name])

    this.logger.success(`Resource "${this.name}" created`)
  }
}
