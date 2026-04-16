import type { WASocket } from '@whiskeysockets/baileys'
import { db } from '../db'
import { ledgerMembers } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { findOrCreateUser } from '../services/user.service'
import { getGroupLedger, addLedgerMember } from '../services/ledger.service'
import { sendTextReply } from '../whatsapp/sender'

export async function handleMemberJoin(
  sock: WASocket,
  groupJid: string,
  participantJid: string
) {
  try {
    // Check if group is registered
    const groupData = await getGroupLedger(groupJid)
    if (!groupData) {
      return // Group not registered, ignore
    }

    const phoneNumber = participantJid.split('@')[0]
    const user = await findOrCreateUser(phoneNumber)

    // Add to ledger
    await addLedgerMember(groupData.ledgerId, user.id, 'member')

    const welcomeText = `👋 Welcome to the group, @${phoneNumber}! You're now part of our finance tracking. Type /help to see all commands.`

    await sendTextReply(sock, groupJid, welcomeText)

    console.log(`[Members] User ${phoneNumber} joined group ${groupJid}`)
  } catch (error) {
    console.error('[Members] Error handling member join:', error)
  }
}

export async function handleMemberLeave(
  sock: WASocket,
  groupJid: string,
  participantJid: string
) {
  try {
    // Check if group is registered
    const groupData = await getGroupLedger(groupJid)
    if (!groupData) {
      return // Group not registered, ignore
    }

    const phoneNumber = participantJid.split('@')[0]
    const user = await findOrCreateUser(phoneNumber)

    // Soft delete: set left_at
    await db
      .update(ledgerMembers)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(ledgerMembers.ledgerId, groupData.ledgerId),
          eq(ledgerMembers.userId, user.id)
        )
      )

    const departureText = `👋 ${phoneNumber} has left the group. Their transactions remain in the ledger.`
    await sendTextReply(sock, groupJid, departureText)

    console.log(`[Members] User ${phoneNumber} left group ${groupJid}`)
  } catch (error) {
    console.error('[Members] Error handling member leave:', error)
  }
}
