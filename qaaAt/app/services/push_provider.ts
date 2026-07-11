import type { ExpoPushMessage, ExpoPushReceipt, ExpoPushTicket } from 'expo-server-sdk'

export interface PushProvider {
  send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>
  getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>>
}
