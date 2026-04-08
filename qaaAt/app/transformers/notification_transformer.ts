import { BaseTransformer } from '@adonisjs/core/transformers'
import type Notification from '#models/notification'

export default class NotificationTransformer extends BaseTransformer<Notification> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'type', 'title', 'message', 'data', 'readAt', 'createdAt']),
      isRead: this.resource.isRead,
    }
  }
}
