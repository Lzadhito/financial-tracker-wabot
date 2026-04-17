import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import {
  getTransactionsWithUserInRange,
  getTotalByTypeInRange,
} from '../services/transaction.service'
import { getLedgerById } from '../services/ledger.service'
import { sendTextReply } from '../whatsapp/sender'
import { type DateFilter, dateFilterToRange } from '../utils/date-filter'

export async function handleQuerySummary(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  ledgerId: string,
  filter: DateFilter = { type: 'period', period: 'month' },
  groupByUser = false,
  userIdFilter: string | null = null
) {
  try {
    const ledger = await getLedgerById(ledgerId)
    if (!ledger) {
      await sendTextReply(sock, remoteJid, 'Ledger not found.', msg)
      return
    }

    const { start, end, label } = dateFilterToRange(filter)

    let txns = await getTransactionsWithUserInRange(ledgerId, start, end)
    if (userIdFilter) {
      txns = txns.filter((t) => t.userId === userIdFilter)
    }
    const expenses = txns.filter((t) => t.transactionType === 'expense' && t.deletedAt === null)
    const activeIncomeTxns = txns.filter((t) => t.transactionType === 'income' && t.deletedAt === null)

    // Compute totals from filtered txns when a user filter is active; otherwise use DB aggregate
    const totalExpenses = userIdFilter
      ? expenses.reduce((sum, t) => sum + t.amount, 0)
      : await getTotalByTypeInRange(ledgerId, start, end, 'expense')
    const totalIncome = userIdFilter
      ? activeIncomeTxns.reduce((sum, t) => sum + t.amount, 0)
      : await getTotalByTypeInRange(ledgerId, start, end, 'income')

    const memberName = userIdFilter
      ? (txns.find((t) => t.userId === userIdFilter)?.memberName ?? 'Unknown')
      : null

    let replyText = memberName
      ? `📊 *Summary — ${memberName} — ${label}*\n\n`
      : `📊 *Summary — ${label}*\n\n`

    if (groupByUser) {
      // Build per-user breakdown
      const byMember: Record<string, { name: string; total: number; categories: Record<string, number> }> = {}
      for (const txn of expenses) {
        if (!byMember[txn.userId]) {
          byMember[txn.userId] = { name: txn.memberName, total: 0, categories: {} }
        }
        byMember[txn.userId].total += txn.amount
        byMember[txn.userId].categories[txn.category] =
          (byMember[txn.userId].categories[txn.category] || 0) + txn.amount
      }

      const memberEntries = Object.values(byMember).sort((a, b) => b.total - a.total)
      for (const member of memberEntries) {
        replyText += `👤 *${member.name}*\n`
        replyText += `   💸 ${formatRupiah(member.total)}\n`
        for (const [cat, amt] of Object.entries(member.categories)) {
          replyText += `   • ${categoryEmoji(cat)} ${capitalizeFirst(cat)}: ${formatRupiah(amt)}\n`
        }
        replyText += '\n'
      }

      replyText += `*Total*\n`
      if (totalIncome > 0) {
        replyText += `💰 Income: ${formatRupiah(totalIncome)}\n`
      }
      replyText += `💸 Expenses: ${formatRupiah(totalExpenses)}\n`
      if (totalIncome > 0 && totalExpenses > 0) {
        const net = totalIncome - totalExpenses
        replyText += `📉 Net: ${net >= 0 ? '+' : ''}${formatRupiah(net)}\n`
      }
    } else {
      if (totalIncome > 0) {
        replyText += `💰 Income: ${formatRupiah(totalIncome)}\n`
      }
      replyText += `💸 Expenses: ${formatRupiah(totalExpenses)}\n`

      if (totalIncome > 0 && totalExpenses > 0) {
        const net = totalIncome - totalExpenses
        replyText += `📉 Net: ${net >= 0 ? '+' : ''}${formatRupiah(net)}\n`
      }

      if (ledger.monthlyBudget && filter.type === 'period' && filter.period === 'month') {
        const remaining = ledger.monthlyBudget - totalExpenses
        replyText += `🎯 Budget remaining: ${formatRupiah(Math.max(0, remaining))}\n`
      }

      // By category
      const byCategory: Record<string, number> = {}
      for (const txn of expenses) {
        byCategory[txn.category] = (byCategory[txn.category] || 0) + txn.amount
      }

      if (Object.keys(byCategory).length > 0) {
        replyText += `\n*By category:*\n`
        for (const [category, amount] of Object.entries(byCategory)) {
          replyText += `• ${categoryEmoji(category)} ${capitalizeFirst(category)}: ${formatRupiah(amount)}\n`
        }
      }

      // By member (groups only)
      if (remoteJid.includes('@g.us')) {
        const byMember: Record<string, { total: number; name: string }> = {}
        for (const txn of expenses) {
          if (!byMember[txn.userId]) {
            byMember[txn.userId] = { total: 0, name: txn.memberName }
          }
          byMember[txn.userId].total += txn.amount
        }

        const memberEntries = Object.values(byMember).filter((m) => m.total > 0)
        if (memberEntries.length > 1) {
          replyText += `\n*By member:*\n`
          for (const { name, total } of memberEntries) {
            replyText += `• ${name}: ${formatRupiah(total)}\n`
          }
        }
      }
    }

    await sendTextReply(sock, remoteJid, replyText, msg)
  } catch (error) {
    console.error('[Handler] Error generating summary:', error)
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

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function categoryEmoji(category: string): string {
  const map: Record<string, string> = {
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
  return map[category] || '📌'
}
