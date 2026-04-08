import DomainException from '#exceptions/domain_exception'

export default class NotificationNotFoundException extends DomainException {
  constructor() {
    super('Notification not found', 404, 'NOTIFICATION_NOT_FOUND')
  }
}
