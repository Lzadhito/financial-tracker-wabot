import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import {
  isJidGroup,
  jidNormalizedUser,
  getContentType,
} from '@whiskeysockets/baileys'
import { sendTypingIndicator, sendTextReply } from './sender'
import { routeMessage } from '../router/message-router'
import { findOrCreateUser } from '../services/user.service'
import { getGroupLedger } from '../services/ledger.service'
import {
  handleGroupOnboarding,
  handleDMOnboarding,
} from '../handlers/onboarding'
import { getUserLedgers } from '../services/ledger.service'

export async function setupMessageListener(sock: WASocket) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    console.log(`[Listener] messages.upsert fired — type: ${type}, count: ${messages.length}`)

    // Only process new incoming messages
    if (type !== 'notify') {
      console.log(`[Listener] Skipping — type is '${type}', not 'notify'`)
      return
    }

    for (const msg of messages) {
      const msgId = msg.key.id ?? '(no-id)'
      try {
        // Skip messages we sent
        if (msg.key.fromMe) {
          console.log(`[Listener] [${msgId}] Skipping — fromMe`)
          continue
        }

        // Skip empty messages
        if (!msg.message) {
          console.log(`[Listener] [${msgId}] Skipping — no message content`)
          continue
        }

        const remoteJid = msg.key.remoteJid!
        const isGroup = isJidGroup(remoteJid)
        const senderJid = isGroup ? msg.key.participant! : msg.key.remoteJid!
        const phoneNumber = senderJid.split('@')[0]
        const messageId = msg.key.id!

        console.log(`[Listener] [${msgId}] Incoming message — from: ${phoneNumber}, jid: ${remoteJid}, isGroup: ${isGroup}`)

        // Extract message text
        const msgType = getContentType(msg.message)
        let text = ''

        console.log(`[Listener] [${msgId}] Message type: ${msgType}`)

        if (msgType === 'conversation') {
          text = msg.message.conversation ?? ''
        } else if (msgType === 'extendedTextMessage') {
          text = msg.message.extendedTextMessage?.text ?? ''
        } else {
          console.log(`[Listener] [${msgId}] Skipping — unsupported message type: ${msgType}`)
          // Ignore media-only messages
          continue
        }

        if (!text.trim()) {
          console.log(`[Listener] [${msgId}] Skipping — empty text`)
          continue
        }

        console.log(`[Listener] [${msgId}] Text: "${text}"`)

        // Handle mention filter for groups
        if (isGroup) {
          const botJid = jidNormalizedUser(sock.user?.id ?? '')
          const botLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : null
          const botPhoneNumber = botJid.split('@')[0]
          const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? []
          const normalizedMentions = mentionedJids.map((jid) => jidNormalizedUser(jid))
          const isBotMentioned = normalizedMentions.some(
            (jid) => jid === botJid || (botLid !== null && jid === botLid),
          )

          console.log(`[Listener] [${msgId}] Group message — botJid: ${botJid}, botLid: ${botLid ?? 'none'}, mentionedJids: [${normalizedMentions.join(', ')}], isBotMentioned: ${isBotMentioned}`)

          if (!isBotMentioned) {
            console.log(`[Listener] [${msgId}] Skipping — bot not mentioned in group`)
            continue // Not mentioned, skip silently
          }

          // Strip bot mention from text (by phone number or LID)
          text = text.replace(new RegExp(`@${botPhoneNumber}`, 'g'), '').trim()
          if (botLid) {
            const botLidNumber = botLid.split('@')[0]
            text = text.replace(new RegExp(`@${botLidNumber}`, 'g'), '').trim()
          }
          console.log(`[Listener] [${msgId}] Text after stripping mention: "${text}"`)
        }

        // Send typing indicator
        await sendTypingIndicator(sock, remoteJid, true)

        // Find or create user
        console.log(`[Listener] [${msgId}] Finding/creating user for phone: ${phoneNumber}`)
        const user = await findOrCreateUser(phoneNumber)
        console.log(`[Listener] [${msgId}] User: id=${user.id}`)

        // Find or create ledger
        let ledger = null
        let isNewLedger = false

        if (isGroup) {
          console.log(`[Listener] [${msgId}] Looking up group ledger for jid: ${remoteJid}`)
          const groupData = await getGroupLedger(remoteJid)
          if (groupData) {
            ledger = groupData.ledger
            console.log(`[Listener] [${msgId}] Found group ledger: id=${ledger.id}`)
          } else {
            console.log(`[Listener] [${msgId}] No group ledger found — starting onboarding`)
            isNewLedger = true
          }
        } else {
          console.log(`[Listener] [${msgId}] Looking up user ledgers for userId: ${user.id}`)
          // DM: find user's personal ledger
          const userLedgers = await getUserLedgers(user.id)
          if (userLedgers.length > 0) {
            ledger = userLedgers[0].ledger
            console.log(`[Listener] [${msgId}] Found user ledger: id=${ledger.id}`)
          } else {
            console.log(`[Listener] [${msgId}] No user ledger found — starting onboarding`)
            isNewLedger = true
          }
        }

        // Handle onboarding if no ledger
        if (isNewLedger) {
          console.log(`[Listener] [${msgId}] Running onboarding — isGroup: ${isGroup}`)
          if (isGroup) {
            await handleGroupOnboarding(sock, remoteJid, msg, senderJid, phoneNumber)
          } else {
            await handleDMOnboarding(sock, remoteJid, msg, user.id)
          }
          await sendTypingIndicator(sock, remoteJid, false)
          continue
        }

        if (!ledger) {
          console.error(`[Listener] [${msgId}] Ledger is null after lookup — sending error reply`)
          await sendTextReply(sock, remoteJid, "Something went wrong. Please try again.")
          await sendTypingIndicator(sock, remoteJid, false)
          continue
        }

        console.log(`[Listener] [${msgId}] Routing message — userId: ${user.id}, ledgerId: ${ledger.id}, text: "${text}"`)

        // Route message to appropriate handler
        await routeMessage(
          sock,
          remoteJid,
          msg,
          user.id,
          ledger.id,
          messageId,
          text,
          phoneNumber
        )

        // Clear typing indicator
        await sendTypingIndicator(sock, remoteJid, false)
        console.log(`[Listener] [${msgId}] Done processing message`)
      } catch (error) {
        console.error('[Listener] Error processing message:', {
          error,
          messageId: msg.key.id,
          from: msg.key.remoteJid,
        })

        try {
          await sendTextReply(sock, msg.key.remoteJid!, "Something went wrong, please try again.")
          await sendTypingIndicator(sock, msg.key.remoteJid!, false)
        } catch (replyError) {
          console.error('[Listener] Error sending error reply:', replyError)
        }
      }
    }
  })
}
