import {
  Expo,
  type ExpoPushMessage,
  type ExpoPushReceipt,
  type ExpoPushTicket,
} from 'expo-server-sdk'
import pushConfig from '#config/push'
import type { PushProvider } from '#services/push_provider'

export class ExpoPushProvider implements PushProvider {
  private client = new Expo({ accessToken: pushConfig.accessToken })

  async send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const tickets: ExpoPushTicket[] = []
    for (const chunk of this.client.chunkPushNotifications(messages)) {
      tickets.push(...(await this.client.sendPushNotificationsAsync(chunk)))
    }
    return tickets
  }

  async getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
    const receipts: Record<string, ExpoPushReceipt> = {}
    for (const chunk of this.client.chunkPushNotificationReceiptIds(ticketIds)) {
      Object.assign(receipts, await this.client.getPushNotificationReceiptsAsync(chunk))
    }
    return receipts
  }
}
