import { Exception } from '@adonisjs/core/exceptions'

export default class DomainException extends Exception {
  constructor(message: string, status: number, code: string) {
    super(message, { status, code })
  }
}
