import vine from '@vinejs/vine'
import { Expo } from 'expo-server-sdk'

const installationIdRule = vine.createRule((value, _, field) => {
  if (typeof value !== 'string') return
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)) {
    field.report(
      'The {{ field }} field must be a valid installation identifier',
      'installationId',
      field
    )
  }
})

const expoPushTokenRule = vine.createRule((value, _, field) => {
  if (typeof value !== 'string') return
  if (!Expo.isExpoPushToken(value)) {
    field.report('The {{ field }} field must be a valid Expo push token', 'expoPushToken', field)
  }
})

export const registerPushInstallationValidator = vine.create({
  installationId: vine.string().trim().minLength(8).maxLength(128).use(installationIdRule()),
  expoPushToken: vine.string().trim().maxLength(255).use(expoPushTokenRule()),
  platform: vine.enum(['ios', 'android'] as const),
  deviceName: vine.string().trim().maxLength(120).optional(),
  appVersion: vine.string().trim().maxLength(40).optional(),
})
