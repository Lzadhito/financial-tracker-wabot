import type { ParsedIntent, BotResponse } from '../types'
import { strings } from '../../copy/strings'
import { updateLedgerBudget } from '../../services/ledger.service'

/**
 * Phase 2: Auto-save budget
 */
export async function handleSetBudget(
  parsed: ParsedIntent,
  ledgerId: string,
  loggerName: string,
  senderJID: string,
  groupJID: string,
  userId: string
): Promise<BotResponse> {
  if (!parsed.entities.amount) {
    return { text: 'Please specify a budget amount. Example: `budget 2jt`' }
  }

  try {
    await updateLedgerBudget(ledgerId, parsed.entities.amount)
    return { text: strings.success.budgetSet(parsed.entities.amount) }
  } catch (error) {
    console.error('[NLU Handler] Error setting budget:', error)
    return { text: strings.errors.generic() }
  }
}
