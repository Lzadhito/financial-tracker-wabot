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
  filter: DateFilter = { type: 'period', period: 'month' },
  groupByUser = false,
  userIdFilter: string | null = null
) {
  try {
    const { start, end, label } = dateFilterToRange(filter)

    let txns = await getTransactionsWithUserInRange(ledgerId, start, end)

    if (userIdFilter) {
      txns = txns.filter((t) => t.userId === userIdFilter)
    }

    if (txns.length === 0) {
      await sendTextReply(sock, remoteJid, `📋 No transactions found for *${label}*.`, msg)
      return
    }

    const active = txns.filter((t) => t.deletedAt === null)
    const totalIncome = active
      .filter((t) => t.transactionType === 'income')
      .reduce((sum, t) => sum + t.amount, 0)
    const totalExpense = active
      .filter((t) => t.transactionType === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)

    const memberName = userIdFilter
      ? (txns.find((t) => t.userId === userIdFilter)?.memberName ?? 'Unknown')
      : null

    let replyText = memberName
      ? `📋 *Transactions — ${memberName} — ${label}*\n`
      : `📋 *Transactions — ${label}*\n`
    replyText += `${txns.length} entries | 💸 ${formatRupiah(totalExpense)} | 💰 ${formatRupiah(totalIncome)}\n`

    if (groupByUser) {
      // Group by member
      const grouped: Map<string, { name: string; txns: typeof txns }> = new Map()
      for (const txn of txns) {
        if (!grouped.has(txn.userId)) {
          grouped.set(txn.userId, { name: txn.memberName, txns: [] })
        }
        grouped.get(txn.userId)!.txns.push(txn)
      }

      for (const { name, txns: memberTxns } of grouped.values()) {
        const memberActive = memberTxns.filter((t) => t.deletedAt === null)
        const memberExpense = memberActive
          .filter((t) => t.transactionType === 'expense')
          .reduce((sum, t) => sum + t.amount, 0)
        replyText += `\n👤 *${name}* — 💸 ${formatRupiah(memberExpense)} (${memberTxns.length})\n`

        // Show up to 10 per member
        const displayed = memberTxns.slice(0, 10)
        for (const txn of displayed) {
          replyText += formatTxnLine(txn)
        }
        if (memberTxns.length > 10) {
          replyText += `   _...and ${memberTxns.length - 10} more_\n`
        }
      }
    } else {
      // Show up to 15 most recent
      const displayed = txns.slice(0, 15)
      replyText += '\n'

      for (const txn of displayed) {
        replyText += formatTxnLine(txn)
      }

      if (txns.length > 15) {
        replyText += `\n_Showing 15 of ${txns.length}. Use a shorter date range for more detail._`
      }
    }

    await sendTextReply(sock, remoteJid, replyText, msg)
  } catch (error) {
    console.error('[Handler] Error listing transactions:', error)
    await sendTextReply(sock, remoteJid, 'Something went wrong. Please try again.')
  }
}

function formatTxnLine(txn: {
  id: string
  createdAt: Date
  transactionType: string
  category: string
  amount: number
  description: string | null
  memberName: string
  deletedAt: Date | null
}): string {
  const shortId = txn.id.slice(0, 8)
  const isDeleted = txn.deletedAt !== null
  const dateStr = txn.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const timeStr = txn.createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  const typeEmoji = TYPE_EMOJI[txn.transactionType] || '•'
  const catEmoji = CATEGORY_EMOJI[txn.category] || '📌'
  const desc = txn.description || txn.category

  if (isDeleted) {
    return (
      `${typeEmoji} ~[${shortId}] ${dateStr} ${timeStr}~\n` +
      `   ~${catEmoji} ${formatRupiah(txn.amount)} — ${desc}~\n` +
      `   ~👤 ${txn.memberName}~ _(deleted)_\n`
    )
  }
  return (
    `${typeEmoji} [${shortId}] ${dateStr} ${timeStr}\n` +
    `   ${catEmoji} ${formatRupiah(txn.amount)} — ${desc}\n` +
    `   👤 ${txn.memberName}\n`
  )
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}
