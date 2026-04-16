import type { WASocket, WAMessage, proto } from '@whiskeysockets/baileys'

export async function sendTypingIndicator(
  sock: WASocket,
  remoteJid: string,
  isTyping: boolean
) {
  try {
    const presenceType = isTyping ? 'composing' : 'paused'
    await sock.sendPresenceUpdate(presenceType, remoteJid)
  } catch (error) {
    console.error('[WhatsApp] Failed to send typing indicator:', error)
  }
}

export async function sendTextReply(
  sock: WASocket,
  remoteJid: string,
  text: string,
  quotedMsg?: WAMessage
) {
  try {
    const options: { quoted?: proto.IMessage } = {}
    if (quotedMsg) {
      options.quoted = quotedMsg.message ?? undefined
    }

    await sock.sendMessage(remoteJid, { text }, options)
  } catch (error) {
    console.error('[WhatsApp] Failed to send message:', error)
    throw error
  }
}
