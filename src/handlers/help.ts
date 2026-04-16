import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { sendTextReply } from '../whatsapp/sender'
import { isJidGroup } from '@whiskeysockets/baileys'

export async function handleHelp(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage
) {
  const isGroup = isJidGroup(remoteJid)

  let helpText = `📋 *FinanceBot Commands*\n\n`

  if (isGroup) {
    helpText += `*Mention the bot first:* @FinanceBot <command>\n\n`
  }

  helpText += `*Log Transactions (natural language):*\n`
  helpText += `• spent 50k lunch\n`
  helpText += `• income 5M salary\n`
  helpText += `• bought 75k groceries\n\n`

  helpText += `*Summaries:*\n`
  helpText += `• /summary — this month\n`
  helpText += `• /summary today | week | month\n`
  helpText += `• /summary 04/2026 — specific month\n`
  helpText += `• /summary 04/16/2026 — specific day\n\n`

  helpText += `*Income Reports:*\n`
  helpText += `• /income — this month's income\n`
  helpText += `• /income 04/2026 — income for April 2026\n\n`

  helpText += `*Transaction List:*\n`
  helpText += `• /transactions — all this month\n`
  helpText += `• /transactions today | week\n`
  helpText += `• /transactions 04/16/2026 — specific day\n\n`

  helpText += `*Delete a Transaction:*\n`
  helpText += `• /delete <name> <day> <month> [HH:MM]\n`
  helpText += `  _e.g. /delete beli kopi 16 april 15:03_\n`
  helpText += `  _e.g. /delete makan siang 16 april_\n`
  helpText += `  _Deleted transactions still appear in the list but are not counted_\n\n`

  helpText += `*Settings:*\n`
  helpText += `• /budget 2000000 — set monthly budget\n`
  helpText += `• /set-income 5000000 — set monthly income goal\n\n`

  helpText += `*Other:*\n`
  helpText += `• /help — this message`

  await sendTextReply(sock, remoteJid, helpText, msg)
}
