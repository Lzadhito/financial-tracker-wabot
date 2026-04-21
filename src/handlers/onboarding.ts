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
      `👋 Hi everyone! I'm your group finance tracker.\n\n` +
      `*Quick start — just mention me:*\n` +
      `• @FinanceBot lunch 50k\n` +
      `• @FinanceBot income 5jt salary\n` +
      `• @FinanceBot summary\n` +
      `• @FinanceBot list\n\n` +
      `*I understand natural language in Indonesian & English:*\n` +
      `• "kopi 15rb" ✓\n` +
      `• "spent 75k groceries" ✓\n` +
      `• "gaji 5jt" ✓\n` +
      `• "coffee 50k yesterday" ✓\n\n` +
      `*Set up your budget:*\n` +
      `• @FinanceBot /budget 2000000\n` +
      `• @FinanceBot /set-income 5000000\n\n` +
      `*Tips for accuracy:*\n` +
      `• Include the amount: "50k" or "50rb" or "50000"\n` +
      `• Add a description: "lunch 50k" not just "50k"\n` +
      `• Say "undo" within 5 min if something's wrong\n\n` +
      `Type @FinanceBot menu anytime for full command list.`

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
      `*Quick start — just type naturally:*\n` +
      `• lunch 50k\n` +
      `• income 5jt salary\n` +
      `• summary\n` +
      `• list\n\n` +
      `*I understand Indonesian & English:*\n` +
      `• "kopi 15rb" ✓\n` +
      `• "spent 75k groceries" ✓\n` +
      `• "coffee 50k yesterday" ✓\n\n` +
      `*Set up your budget:*\n` +
      `• /budget 2000000\n` +
      `• /set-income 5000000\n\n` +
      `*Tips:*\n` +
      `• Include the amount: "50k" or "50rb" or "50000"\n` +
      `• Add a description: "lunch 50k" not just "50k"\n` +
      `• Say "undo" within 5 min if something's wrong\n\n` +
      `Type "menu" anytime for full command list.`

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
