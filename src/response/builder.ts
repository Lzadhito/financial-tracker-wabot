import type { WASocket } from '@whiskeysockets/baileys'
import type { BotResponse } from '../nlu/types'

/**
 * Converts a BotResponse into a Baileys message payload and sends it.
 *
 * Phase 1: text-only replies. Interactive buttons/lists are wired in Phase 2
 * after verifying Baileys RC interactive message support.
 */
export async function sendBotResponse(
  sock: WASocket,
  remoteJid: string,
  response: BotResponse,
  quotedMsg?: import('@whiskeysockets/baileys').WAMessage
): Promise<void> {
  // Phase 1: plain text only
  // Phase 2 will add button and list message payloads here
  const payload: { text: string } = { text: response.text }

  try {
    await sock.sendMessage(
      remoteJid,
      payload,
      quotedMsg ? { quoted: quotedMsg } : undefined
    )
  } catch (error) {
    console.error('[ResponseBuilder] Failed to send message:', error)
    throw error
  }
}
