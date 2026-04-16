import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { getTransactionsWithUserInRange } from '../services/transaction.service'
import { sendTextReply } from '../whatsapp/sender'
import { type DateFilter, dateFilterToRange } from '../utils/date-filter'

const TYPE_EMOJI: Record<string, string> = {
  income: '📥',
  expense: '📤',
}

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍜',
  transport: '🚗',
  bills: '📄',
  shopping: '🛍️',
  entertainment: '🎮',
  health: '⚕️',
  education: '📚',
  income: '💰',
  other: '📌',
}

export async function handleTransactionsList(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  ledgerId: string,
  filter: DateFilter = { type: 'period', period: 'month' }
) {
  try {
    const { start, end, label } = dateFilterToRange(filter)

    const txns = await getTransactionsWithUserInRange(ledgerId, start, end)

    if (txns.length === 0) {
      await sendTextReply(sock, remoteJid, `📋 No transactions found for *${label}*.`, msg)
      return
    }

    const totalIncome = txns
      .filter((t) => t.transactionType === 'income')
      .reduce((sum, t) => sum + t.amount, 0)
    const totalExpense = txns
      .filter((t) => t.transactionType === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)

    let replyText = `📋 *Transactions — ${label}*\n`
    replyText += `${txns.length} entries | 💸 ${formatRupiah(totalExpense)} | 💰 ${formatRupiah(totalIncome)}\n`

    // Show up to 15 most recent
    const displayed = txns.slice(0, 15)
    replyText += '\n'

    for (const txn of displayed) {
      const dateStr = txn.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const timeStr = txn.createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      const typeEmoji = TYPE_EMOJI[txn.transactionType] || '•'
      const catEmoji = CATEGORY_EMOJI[txn.category] || '📌'
      const desc = txn.description || txn.category
      replyText += `${typeEmoji} ${dateStr} ${timeStr}\n`
      replyText += `   ${catEmoji} ${formatRupiah(txn.amount)} — ${desc}\n`
      replyText += `   👤 ${txn.memberName}\n`
    }

    if (txns.length > 15) {
      replyText += `\n_Showing 15 of ${txns.length}. Use a shorter date range for more detail._`
    }

    await sendTextReply(sock, remoteJid, replyText, msg)
  } catch (error) {
    console.error('[Handler] Error listing transactions:', error)
    await sendTextReply(sock, remoteJid, 'Something went wrong. Please try again.')
  }
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}
