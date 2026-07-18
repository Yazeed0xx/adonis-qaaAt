import db from '@adonisjs/lucid/services/db'

export async function deliveredInvitationToken() {
  const row = await db.from('notification_outbox').orderBy('id', 'desc').firstOrFail()
  const token = String(row.payload.message).match(/[?&]token=([^\s]+)/)?.[1]

  if (!token) {
    throw new Error('Invitation delivery did not contain an acceptance token')
  }

  return token
}
