import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'

const mailConfig = defineConfig({
  default: 'resend',

  /**
   * The mailers object can be used to configure multiple mailers
   * each using a different transport or same transport with different
   * options.
   */
  mailers: {
    resend: transports.resend({
      key: env.get('RESEND_API_KEY', ''),
      baseUrl: 'https://api.resend.com',
    }),
  },

  /**
   * Sender's email address. This will be used if you don't provide
   * a "from" address when sending an email.
   */
  from: {
    address: env.get('MAIL_FROM_ADDRESS', 'noreply@resend.com'),
    name: env.get('MAIL_FROM_NAME', 'Resend'),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
