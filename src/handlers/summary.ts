import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import {
  getTotalExpensesByPeriod,
  getTransactionsByCategory,
  getTransactionsByMember,
} from '../services/transaction.service'
import { getLedgerById, getLedgerMembers } from '../services/ledger.service'
import { sendTextReply } from '../whatsapp/sender'

type Period = 'today' | 'week' | 'month'

function periodEmoji(period: Period): string {
  switch (period) {
    case 'today':
      return '📅'
    case 'week':
      return '📊'
    case 'month':
      return '📈'
  }
}

function periodLabel(period: Period): string {
  switch (period) {
    case 'today':
      return 'Today'
    case 'week':
      return 'This Week'
    case 'month':
      return 'This Month'
  }
}

export async function handleQuerySummary(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  ledgerId: string,
  period: Period = 'month'
) {
  try {
    const ledger = await getLedgerById(ledgerId)
    if (!ledger) {
      await sendTextReply(sock, remoteJid, "Ledger not found.", msg)
      return
    }

    const totalExpenses = await getTotalExpensesByPeriod(ledgerId, period)
    const byCategory = await getTransactionsByCategory(ledgerId, period)

    let replyText = `${periodEmoji(period)} *${periodLabel(period)} Summary*\n\n`
    replyText += `Total spent: ${formatRupiah(totalExpenses)}\n`

    if (ledger.monthlyBudget) {
      const remaining = ledger.monthlyBudget - totalExpenses
      replyText += `Budget remaining: ${formatRupiah(Math.max(0, remaining))}\n`
    }

    if (Object.keys(byCategory).length > 0) {
      replyText += `\n*By category:*\n`

      for (const [category, amount] of Object.entries(byCategory)) {
        replyText += `• ${categoryEmoji(category)} ${capitalizeFirst(category)}: ${formatRupiah(amount)}\n`
      }
    }

    // Add member breakdown for groups only
    if (remoteJid.includes('@g.us')) {
      const members = await getLedgerMembers(ledgerId)
      if (members.length > 1) {
        const byMember = await getTransactionsByMember(ledgerId, period)

        if (Object.keys(byMember).length > 0) {
          replyText += `\n*By member:*\n`

          for (const [, memberData] of Object.entries(byMember)) {
            if (memberData.total > 0) {
              replyText += `• ${memberData.name}: ${formatRupiah(memberData.total)}\n`
            }
          }
        }
      }
    }

    await sendTextReply(sock, remoteJid, replyText, msg)
  } catch (error) {
    console.error('[Handler] Error generating summary:', error)
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
