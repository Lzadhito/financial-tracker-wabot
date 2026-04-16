import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { isJidGroup } from '@whiskeysockets/baileys'
import { sendTextReply } from '../whatsapp/sender'
import { createLedger, addLedgerMember, createGroupChat } from '../services/ledger.service'
import { findOrCreateUser } from '../services/user.service'
import { db } from '../db'
import { groupMetadataCache } from '../whatsapp/client'

export async function handleGroupOnboarding(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  senderJid: string,
  senderPhoneNumber: string
) {
  try {
    // Fetch group metadata
    const metadata = await sock.groupMetadata(remoteJid)
    groupMetadataCache.set(remoteJid, metadata)

    // Use database transaction for atomic operations
    await db.transaction(async (tx) => {
      // Create ledger with group name
      const ledger = await createLedger(metadata.subject)

      // Add all current participants
      for (const participant of metadata.participants) {
        const participantPhone = participant.id.split('@')[0]
        const participantJid = participant.id

        const user = await findOrCreateUser(participantPhone)

        const role = participantJid === senderJid ? 'owner' : 'member'
        await addLedgerMember(ledger.id, user.id, role)
      }

      // Create group_chats mapping
      await createGroupChat(ledger.id, remoteJid)
    })

    const replyText =
      `👋 Hi everyone! I'm your financial tracker.\n\n` +
      `*How to use:*\n` +
      `• Mention me: @FinanceBot spent 50k lunch\n` +
      `• I'll log expenses, calculate totals, and track budgets\n\n` +
      `*First steps:*\n` +
      `• @FinanceBot /income 5000000 (set group income)\n` +
      `• @FinanceBot /budget 2000000 (set monthly budget)\n` +
      `• @FinanceBot /help (see all commands)\n\n` +
      `Ready? Try: @FinanceBot spent 50k lunch`

    await sendTextReply(sock, remoteJid, replyText, msg)

    console.log(`[Onboarding] Group ${remoteJid} set up successfully`)
  } catch (error) {
    console.error('[Onboarding] Error setting up group:', error)
    await sendTextReply(
      sock,
      remoteJid,
      "Something went wrong during setup. Please try again."
    )
  }
}

export async function handleDMOnboarding(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  userId: string
) {
  try {
    // Create personal ledger
    const ledger = await createLedger(`Personal (${remoteJid.split('@')[0]})`)

    // Add user as owner
    await addLedgerMember(ledger.id, userId, 'owner')

    const replyText =
      `👋 Hi! I'm your personal finance tracker.\n\n` +
      `*How to use:*\n` +
      `• Send: spent 50k lunch\n` +
      `• Send: income 5M salary\n` +
      `• I'll track all your expenses\n\n` +
      `*Commands:*\n` +
      `• /summary (this month)\n` +
      `• /budget 2000000 (set monthly budget)\n` +
      `• /income 5000000 (set monthly income)\n` +
      `• /help (all commands)\n\n` +
      `Ready? Try: spent 50k lunch`

    await sendTextReply(sock, remoteJid, replyText, msg)

    console.log(`[Onboarding] User ${userId} set up personal ledger`)
  } catch (error) {
    console.error('[Onboarding] Error setting up user:', error)
    await sendTextReply(
      sock,
      remoteJid,
      "Something went wrong during setup. Please try again."
    )
  }
}
