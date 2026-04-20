import { formatInTimeZone } from 'date-fns-tz'
import type { BotResponse } from '../types'
import { strings } from '../../copy/strings'
import { getTodayTransactions } from '../../services/transaction.service'
import { db } from '../../db'
import { users } from '../../db/schema'
import { eq } from 'drizzle-orm'

/**
 * Show today's transactions row by row.
 * Lists all non-deleted transactions for the ledger today.
 */
export async function handleShowTransactions(
  ledgerId: string
): Promise<BotResponse> {
  try {
    const txns = await getTodayTransactions(ledgerId)

    if (txns.length === 0) {
      return { text: 'No transactions logged today.' }
    }

    // Fetch user names for each transaction
    const userMap = new Map<string, string>()
    for (const txn of txns) {
      if (!userMap.has(txn.userId)) {
        const user = await db.query.users.findFirst({
          where: eq(users.id, txn.userId),
        })
        userMap.set(txn.userId, user?.displayName || user?.phoneNumber || txn.userId)
      }
    }

    let text = `📋 Today's transactions — ${txns.length} total\n\n`

    let totalExpense = 0
    let totalIncome = 0

    for (const txn of txns) {
      const userName = userMap.get(txn.userId) || 'Unknown'
      const type = txn.transactionType === 'expense' ? '📤' : '📥'
      const desc = txn.description || txn.category || 'Unnamed'

      // Format time as HH:mm
      const time = formatInTimeZone(new Date(txn.createdAt), 'UTC', 'HH:mm')

      text += `${type} ${strings.formatAmount(txn.amount)} — ${desc}\n`
      text += `   ${userName} · ${time}\n`

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
