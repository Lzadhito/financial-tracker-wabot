import type { ParsedIntent, BotResponse } from '../types'
import { strings } from '../../copy/strings'
import { recordTransaction } from '../../services/transaction.service'
import { setLastAction } from '../../session/store'
import { isFutureDated } from '../../utils/futureDate'
import { dateFilterToRange, parseDateFilter } from '../../utils/date-filter'

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

  // Handle transactionDate (backdating)
  // Fallback: Haiku sometimes puts specific date in `period` for add intents — promote it
  if (!parsed.entities.transactionDate && parsed.entities.period
      && /^\d{4}-\d{2}-\d{2}$/.test(parsed.entities.period)) {
    parsed.entities.transactionDate = parsed.entities.period
    delete parsed.entities.period
  }

  let transactionCreatedAt: Date | undefined = undefined
  let backdateLabel: string | undefined = undefined
  if (parsed.entities.transactionDate) {
    const td = parsed.entities.transactionDate
    if (td === 'yesterday') {
      const { start } = dateFilterToRange({ type: 'period', period: 'yesterday' })
      transactionCreatedAt = new Date(start.getTime() + 12 * 60 * 60 * 1000) // noon Jakarta
      backdateLabel = 'Yesterday'
    } else {
      const filter = parseDateFilter([td])
      if (filter.type === 'range') {
        const noon = new Date(filter.start.getTime() + 12 * 60 * 60 * 1000)
        if (noon > new Date()) {
          return { text: `⏰ Cannot log transactions for future dates.` }
        }
        transactionCreatedAt = noon
        backdateLabel = filter.label
      }
    }
  }

  // Future-date check: skip if we already have a known past transactionDate
  if (!parsed.entities.transactionDate) {
    const checkText = (parsed.entities.description || '') + ' ' + rawMessage
    if (isFutureDated(checkText)) {
      return {
        text: `⏰ I see this might be for a future date. Scheduled entries aren't supported yet.\n\nWant me to log this for today instead?\n\n*1* Log for today\n*2* Cancel`,
      }
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
      createdAt: transactionCreatedAt,
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
      (backdateLabel ? `\n📅 Logged for: ${backdateLabel}` : '') +
      `\n\n↶ Reply *undo* within 5 min to undo.` +
      strings.success.polishingNotice()

    return { text }
  } catch (error) {
    console.error('[NLU Handler] Error recording income:', error)
    return { text: strings.errors.generic() }
  }
}
