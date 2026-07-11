import { BaseTransformer } from '@adonisjs/core/transformers'
import type PushInstallation from '#models/push_installation'

export default class PushInstallationTransformer extends BaseTransformer<PushInstallation> {
  toObject() {
    return this.pick(this.resource, [
      'installationId',
      'platform',
      'deviceName',
      'appVersion',
      'notificationsEnabled',
      'lastSeenAt',
    ])
  }
}
