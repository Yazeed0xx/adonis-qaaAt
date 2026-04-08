import mail from '@adonisjs/mail/services/main'
import { Job } from '@adonisjs/queue'
import type { JobOptions } from '@adonisjs/queue/types'

interface SendMailPayload {
  to: string
  subject: string
  html: string
}

export default class SendMailJob extends Job<SendMailPayload> {
  static options: JobOptions = {
    queue: 'emails',
    maxRetries: 5,
    timeout: '30s',
  }

  async execute() {
    await mail.send((message) => {
      message.to(this.payload.to).subject(this.payload.subject).html(this.payload.html)
    })
  }
}
