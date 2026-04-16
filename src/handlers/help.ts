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

  helpText += `*Log Transactions:*\n`
  helpText += `• spent 50k lunch\n`
  helpText += `• income 5M salary\n`
  helpText += `• bought 75k groceries\n\n`

  helpText += `*Summaries:*\n`
  helpText += `• /summary (this month)\n`
  helpText += `• /summary week\n`
  helpText += `• /summary month\n\n`

  helpText += `*Budget & Income:*\n`
  helpText += `• /budget 2000000\n`
  helpText += `• /income 5000000\n\n`

  helpText += `*Other:*\n`
  helpText += `• /help (this message)`

  await sendTextReply(sock, remoteJid, helpText, msg)
}
