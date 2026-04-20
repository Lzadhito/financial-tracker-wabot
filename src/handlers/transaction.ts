import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { recordTransaction, findTransactionByMessageId, getTotalExpensesByPeriod } from '../services/transaction.service'
import type { ParsedData } from '../ai/haiku'
import { sendTextReply } from '../whatsapp/sender'

export async function handleLogTransaction(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  userId: string,
  ledgerId: string,
  messageId: string,
  rawMessage: string,
  parsed: ParsedData
) {
  // Dedup check
  const existing = await findTransactionByMessageId(messageId)
  if (existing) {
    console.log(
      `[Handler] Transaction already recorded for message ${messageId}, skipping dedup`
    )
    return
  }

  if (!parsed.amount || !parsed.category) {
    await sendTextReply(
      sock,
      remoteJid,
      "I couldn't parse the amount or category. Try: 'spent 50k lunch' or 'income 5M salary'"
    )
    return
  }

  const transactionType = parsed.intent === 'log_income' ? 'income' : 'expense'

  try {
    const txn = await recordTransaction({
      ledgerId,
      userId,
      amount: parsed.amount,
      category: parsed.category,
      description: parsed.description,
      transactionType,
      messageId,
      rawMessage,
      aiParsedData: parsed,
    })

    // Get updated total for this month
    const totalExpenses = await getTotalExpensesByPeriod(ledgerId, 'month')

    const emoji = transactionType === 'income' ? '📥' : '📤'
    const formattedAmount = formatRupiah(parsed.amount)
    const replyText =
      `${emoji} *${transactionType.charAt(0).toUpperCase() + transactionType.slice(1)} logged*\n\n` +
      `Amount: ${formattedAmount}\n` +
      `Category: ${parsed.category}${parsed.description ? `\nMemo: ${parsed.description}` : ''}\n\n` +
      `Month total expenses: ${formatRupiah(totalExpenses)}`

    await sendTextReply(sock, remoteJid, replyText, msg)
  } catch (error) {
    console.error('[Handler] Error recording transaction:', error)
    await sendTextReply(
      sock,
      remoteJid,
      "Something went wrong. Please try again."
    )
  }
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}
