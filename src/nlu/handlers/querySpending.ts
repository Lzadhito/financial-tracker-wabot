import { addDays, startOfDay, startOfMonth, startOfWeek, subDays, subMonths, format } from 'date-fns'
import type { ParsedIntent, BotResponse } from '../types'
import { strings } from '../../copy/strings'
import {
  getTransactionsWithUserInRange,
  getTotalByTypeInRange,
} from '../../services/transaction.service'
import { getLedgerById } from '../../services/ledger.service'
import { dateFilterToRange, type DateFilter } from '../../utils/date-filter'

function periodToDateFilter(period?: string): DateFilter {
  switch (period) {
    case 'today':
      return { type: 'period', period: 'today' }
    case 'yesterday': {
      const y = startOfDay(subDays(new Date(), 1))
      const yEnd = addDays(y, 1)
      return {
        type: 'range',
        start: y,
        end: yEnd,
        label: 'Yesterday',
      }
    }
    case 'this_week':
      return { type: 'period', period: 'week' }
    case 'last_week': {
      const end = startOfWeek(new Date())
      const start = subDays(end, 7)
      return { type: 'range', start, end, label: 'Last week' }
    }
    case 'last_month': {
      const now = new Date()
      const start = startOfMonth(subMonths(now, 1))
      const end = startOfMonth(now)
      return {
        type: 'range',
        start,
        end,
        label: format(start, 'MMMM yyyy'),
      }
    }
    case 'this_month':
    default:
      return { type: 'period', period: 'month' }
  }
}

export async function handleQuerySpending(
  parsed: ParsedIntent,
  ledgerId: string
): Promise<BotResponse> {
  try {
    const ledger = await getLedgerById(ledgerId)
    if (!ledger) return { text: 'Ledger not found.' }

    const filter = periodToDateFilter(parsed.entities.period)
    const { start, end, label } = dateFilterToRange(filter)

    const txns = await getTransactionsWithUserInRange(ledgerId, start, end)
    const expenses = txns.filter(
      (t) => t.transactionType === 'expense' && t.deletedAt === null
    )

    const totalExpenses = await getTotalByTypeInRange(ledgerId, start, end, 'expense')
    const totalIncome = await getTotalByTypeInRange(ledgerId, start, end, 'income')
    const net = totalIncome - totalExpenses

    // By category
    const byCategory: Record<string, number> = {}
    for (const txn of expenses) {
      byCategory[txn.category] = (byCategory[txn.category] || 0) + txn.amount
    }

    const categories = Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([name, amount]) => ({ name, amount }))

    let text = `📊 *Summary — ${label}*\n`
    text += `Spent: ${strings.formatAmount(totalExpenses)}\n`
    if (totalIncome > 0) {
      text += `Income: ${strings.formatAmount(totalIncome)}\n`
      text += `Net: ${strings.formatAmount(net)}\n`
    }

    if (ledger.monthlyBudget && filter.type === 'period' && filter.period === 'month') {
      const remaining = ledger.monthlyBudget - totalExpenses
      text += `🎯 Budget remaining: ${strings.formatAmount(Math.max(0, remaining))}\n`
    }

    if (categories.length > 0) {
      text += `\nTop categories:\n`
      for (const cat of categories) {
        text += `• ${cat.name.charAt(0).toUpperCase() + cat.name.slice(1)} — ${strings.formatAmount(cat.amount)}\n`
      }
    }

    // Add by-member breakdown
    if (txns.length > 0) {
      const byMember: Record<string, { total: number; count: number }> = {}
      for (const txn of txns) {
        if (txn.transactionType === 'expense') {
          if (!byMember[txn.memberName]) {
            byMember[txn.memberName] = { total: 0, count: 0 }
          }
          byMember[txn.memberName].total += txn.amount
          byMember[txn.memberName].count += 1
        }
      }

      if (Object.keys(byMember).length > 0) {
        text += `\n👥 By member:\n`
        for (const [name, data] of Object.entries(byMember).sort(
          (a, b) => b[1].total - a[1].total
        )) {
          text += `• ${name}: ${strings.formatAmount(data.total)} · ${data.count} entries\n`
        }
      }
    }

    return { text }
  } catch (error) {
    console.error('[NLU Handler] Error querying spending:', error)
    return { text: strings.errors.generic() }
  }
}
