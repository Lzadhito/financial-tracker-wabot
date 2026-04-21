import { formatInTimeZone } from 'date-fns-tz'
import type { BotResponse, ParsedIntent } from '../types'
import { strings } from '../../copy/strings'
import { getTransactionsWithUserInRange } from '../../services/transaction.service'
import { dateFilterToRange, parseDateFilter, type DateFilter } from '../../utils/date-filter'

function periodToDateFilter(period?: string): DateFilter {
  switch (period) {
    case 'yesterday':
      return { type: 'period', period: 'yesterday' }
    case 'this_week':
      return { type: 'period', period: 'week' }
    case 'this_month':
      return { type: 'period', period: 'month' }
    case 'today':
      return { type: 'period', period: 'today' }
    default: {
      if (period) {
        // ISO date from Haiku: "2026-04-19"
        const isoMatch = period.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (isoMatch) {
          const m = parseInt(isoMatch[2])
          const d = parseInt(isoMatch[3])
          const y = parseInt(isoMatch[1])
          return parseDateFilter([`${m}/${d}/${y}`])
        }
        // Natural language from Haiku: "april 19", "19 april 2026"
        const natural = parseDateFilter(period.split(/\s+/))
        if (natural.type === 'range') return natural
      }
      return { type: 'period', period: 'today' }
    }
  }
}

/**
 * Show transactions for a given period (default: today).
 * Supports period entity from NLU: today, yesterday, this_week, this_month.
 */
export async function handleShowTransactions(
  ledgerId: string,
  parsed: ParsedIntent
): Promise<BotResponse> {
  try {
    const filter = periodToDateFilter(parsed.entities.period)
    const { start, end, label } = dateFilterToRange(filter)

    const allTxns = await getTransactionsWithUserInRange(ledgerId, start, end)
    const txns = allTxns.filter((t) => t.deletedAt === null)

    if (txns.length === 0) {
      return { text: `No transactions logged for ${label}.` }
    }

    let text = `📋 *${label}* — ${txns.length} transaction${txns.length === 1 ? '' : 's'}\n\n`

    let totalExpense = 0
    let totalIncome = 0

    for (const txn of txns) {
      const type = txn.transactionType === 'expense' ? '📤' : '📥'
      const desc = txn.description || txn.category || 'Unnamed'
      const time = formatInTimeZone(new Date(txn.createdAt), 'Asia/Jakarta', 'HH:mm')

      text += `${type} ${strings.formatAmount(txn.amount)} — ${desc}\n`
      text += `   ${txn.memberName} · ${time}\n`

      if (txn.transactionType === 'expense') {
        totalExpense += txn.amount
      } else {
        totalIncome += txn.amount
      }
    }

    text += `\n💰 Total: Spent ${strings.formatAmount(totalExpense)}`
    if (totalIncome > 0) {
      text += ` · Income ${strings.formatAmount(totalIncome)}`
    }

    return { text }
  } catch (error) {
    console.error('[NLU Handler] Error showing transactions:', error)
    return { text: strings.errors.generic() }
  }
}
