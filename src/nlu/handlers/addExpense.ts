import type { ParsedIntent, BotResponse } from '../types'
import { strings } from '../../copy/strings'
import { recordTransaction, getTotalExpensesByPeriod } from '../../services/transaction.service'
import { setLastAction } from '../../session/store'
import { db } from '../../db'
import { isFutureDated } from '../../utils/futureDate'
import { dateFilterToRange, parseDateFilter } from '../../utils/date-filter'

/**
 * Phase 2: Auto-save with 5-min undo window
 *
 * 1. Validate amount
 * 2. Write to DB immediately
 * 3. Set lastAction for undo (5-min window)
 * 4. Reply with success + undo instructions
 *
 * No pending confirmation, no number confirmations — just save and undo if needed.
 */
export async function handleAddExpense(
  parsed: ParsedIntent,
  userId: string,
  ledgerId: string,
  messageId: string,
  rawMessage: string,
  loggerName: string,
  senderJID: string,
  groupJID: string
): Promise<BotResponse> {
  // Multi-expense case
  if (parsed.entities.items && parsed.entities.items.length > 0) {
    return handleMultiExpense(parsed, userId, ledgerId, messageId, rawMessage, loggerName, groupJID)
  }

  // Single expense case
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
      // ISO date "2026-04-19" or natural date from Haiku
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

  const category = parsed.entities.category || 'other'
  const description = parsed.entities.description || parsed.entities.merchant || null

  try {
    const txn = await recordTransaction({
      ledgerId,
      userId,
      amount: parsed.entities.amount,
      category,
      description,
      transactionType: 'expense',
      messageId,
      rawMessage,
      aiParsedData: parsed as any,
      createdAt: transactionCreatedAt,
    })

    // Set last action for undo (5-min window)
    const undoExpiresAt = Date.now() + 5 * 60 * 1000
    setLastAction(groupJID, {
      recordId: txn.id,
      intent: 'add_expense',
      loggedBy: userId,
      at: Date.now(),
      undoExpiresAt,
    })

    const totalExpenses = await getTotalExpensesByPeriod(ledgerId, 'month')

    const text =
      strings.success.saved(
        {
          amount: txn.amount,
          category: txn.category,
          description: txn.description,
          transactionType: 'expense',
        },
        loggerName
      ) +
      (backdateLabel ? `\n📅 Logged for: ${backdateLabel}` : '') +
      `\n\nMonth total: ${strings.formatAmount(totalExpenses)}\n\n` +
      `↶ Reply *undo* within 5 min to undo.` +
      strings.success.polishingNotice()

    return { text }
  } catch (error) {
    console.error('[NLU Handler] Error recording expense:', error)
    return { text: strings.errors.generic() }
  }
}

async function handleMultiExpense(
  parsed: ParsedIntent,
  userId: string,
  ledgerId: string,
  messageId: string,
  rawMessage: string,
  loggerName: string,
  groupJID: string
): Promise<BotResponse> {
  const items = parsed.entities.items!

  try {
    // Wrap all saves in a DB transaction for atomicity
    const txns = await db.transaction(async (tx) => {
      const results = []
      const undoExpiresAt = Date.now() + 5 * 60 * 1000

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const itemMessageId = `${messageId}:${i}`

        const txn = await recordTransaction({
          ledgerId,
          userId,
          amount: item.amount,
          category: item.category || 'other',
          description: item.merchant || null,
          transactionType: 'expense',
          messageId: itemMessageId,
          rawMessage,
          aiParsedData: parsed as any,
        })

        results.push(txn)
      }

      // Set last action pointing to first item (for undo simplicity)
      setLastAction(groupJID, {
        recordId: results[0].id,
        intent: 'add_expense_multi',
        loggedBy: userId,
        at: Date.now(),
        undoExpiresAt,
      })

      return results
    })

    const totalAmount = items.reduce((s, i) => s + i.amount, 0)
    const totalExpenses = await getTotalExpensesByPeriod(ledgerId, 'month')

    const itemList = items
      .map((item) => `• ${item.merchant || 'Item'} — ${strings.formatAmount(item.amount)}`)
      .join('\n')

    const text =
      `✅ *${items.length} expenses logged*\n\n${itemList}\n\n` +
      `Total: ${strings.formatAmount(totalAmount)}\n` +
      `Logged by: ${loggerName}\n\n` +
      `Month total: ${strings.formatAmount(totalExpenses)}\n\n` +
      `↶ Reply *undo* within 5 min to undo all.` +
      strings.success.polishingNotice()

    return { text }
  } catch (error) {
    console.error('[NLU Handler] Error recording multi-expense:', error)
    return { text: strings.errors.generic() }
  }
}
