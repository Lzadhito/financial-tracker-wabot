import type { ParsedIntent, BotResponse } from '../types'
import { strings } from '../../copy/strings'
import { getLedgerById } from '../../services/ledger.service'
import { getTotalByTypeInRange } from '../../services/transaction.service'
import { dateFilterToRange } from '../../utils/date-filter'

export async function handleQueryBalance(
  parsed: ParsedIntent,
  ledgerId: string
): Promise<BotResponse> {
  try {
    const ledger = await getLedgerById(ledgerId)
    if (!ledger) return { text: 'Ledger not found.' }

    const { start, end } = dateFilterToRange({ type: 'period', period: 'month' })
    const totalExpenses = await getTotalByTypeInRange(ledgerId, start, end, 'expense')
    const totalIncome = await getTotalByTypeInRange(ledgerId, start, end, 'income')

    let text = `📊 *Balance — This month*\n`

    if (ledger.monthlyBudget) {
      const remaining = ledger.monthlyBudget - totalExpenses
      text += `Budget: ${strings.formatAmount(ledger.monthlyBudget)}\n`
      text += `Spent: ${strings.formatAmount(totalExpenses)}\n`
      text += `Remaining: ${strings.formatAmount(Math.max(0, remaining))}\n`
    } else {
      text += `Spent: ${strings.formatAmount(totalExpenses)}\n`
    }

    if (totalIncome > 0 || ledger.monthlyIncome) {
      const income = ledger.monthlyIncome || totalIncome
      text += `Income: ${strings.formatAmount(income)}\n`
      text += `Net: ${strings.formatAmount(income - totalExpenses)}\n`
    }

    if (!ledger.monthlyBudget) {
      text += `\nTip: Set a budget with \`budget 2jt\` to track remaining.`
    }

    return { text }
  } catch (error) {
    console.error('[NLU Handler] Error querying balance:', error)
    return { text: strings.errors.generic() }
  }
}
