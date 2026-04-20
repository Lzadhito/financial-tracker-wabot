import type { ParsedIntent, BotResponse } from '../types'
import { strings } from '../../copy/strings'
import { recordTransaction } from '../../services/transaction.service'
import { setLastAction } from '../../session/store'
import { isFutureDated } from '../../utils/futureDate'

/**
 * Phase 2: Auto-save income with 5-min undo window
 */
export async function handleAddIncome(
  parsed: ParsedIntent,
  userId: string,
  ledgerId: string,
  messageId: string,
  rawMessage: string,
  loggerName: string,
  senderJID: string,
  groupJID: string
): Promise<BotResponse> {
  if (!parsed.entities.amount) {
    return { text: strings.errors.parseFailed() }
  }

  // Check for future-dated entries
  const checkText = (parsed.entities.description || '') + ' ' + rawMessage
  if (isFutureDated(checkText)) {
    return {
      text: `⏰ I see this might be for a future date. Scheduled entries aren't supported yet.\n\nWant me to log this for today instead?\n\n*1* Log for today\n*2* Cancel`,
    }
  }

  const description = parsed.entities.description || parsed.entities.merchant || null

  try {
    const txn = await recordTransaction({
      ledgerId,
      userId,
      amount: parsed.entities.amount,
      category: parsed.entities.category || 'income',
      description,
      transactionType: 'income',
      messageId,
      rawMessage,
      aiParsedData: parsed as any,
    })

    // Set last action for undo (5-min window)
    const undoExpiresAt = Date.now() + 5 * 60 * 1000
    setLastAction(groupJID, {
      recordId: txn.id,
      intent: 'add_income',
      loggedBy: userId,
      at: Date.now(),
      undoExpiresAt,
    })

    const text =
      strings.success.saved(
        {
          amount: txn.amount,
          category: txn.category,
          description: txn.description,
          transactionType: 'income',
        },
        loggerName
      ) +
      `\n\n↶ Reply *undo* within 5 min to undo.`

    return { text }
  } catch (error) {
    console.error('[NLU Handler] Error recording income:', error)
    return { text: strings.errors.generic() }
  }
}
