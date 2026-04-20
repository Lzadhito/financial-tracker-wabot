import type { BotResponse } from '../types'
import { strings } from '../../copy/strings'
import { getSession } from '../../session/store'
import { softDeleteTransaction } from '../../services/transaction.service'

export async function handleDeleteLast(
  groupJID: string
): Promise<BotResponse> {
  const session = getSession(groupJID)

  if (!session.lastAction) {
    return {
      text: `No recent transaction to undo. Use /delete to remove a specific entry.`,
    }
  }

  const { recordId, at } = session.lastAction
  const UNDO_WINDOW_MS = 5 * 60 * 1000

  if (Date.now() - at > UNDO_WINDOW_MS) {
    return { text: strings.errors.undoExpired() }
  }

  // We need the ledgerId from the session's lastAction context
  // For Phase 1, we receive it via parameter — will be cleaner in Phase 2
  // For now, pass null and the soft delete function handles it
  // Actually, softDeleteTransaction needs ledgerId. We'll pass it from the router.
  return {
    text: `To undo a specific entry, use /delete. Contextual undo will be available in a future update.`,
  }
}

export async function handleDeleteLastWithLedger(
  groupJID: string,
  ledgerId: string
): Promise<BotResponse> {
  const session = getSession(groupJID)

  if (!session.lastAction) {
    return {
      text: `No recent transaction to undo. Use /delete to remove a specific entry.`,
    }
  }

  const { recordId, at } = session.lastAction
  const UNDO_WINDOW_MS = 5 * 60 * 1000

  if (Date.now() - at > UNDO_WINDOW_MS) {
    return { text: strings.errors.undoExpired() }
  }

  try {
    const deleted = await softDeleteTransaction(recordId, ledgerId)
    if (!deleted) {
      return { text: `Could not undo — the transaction may have already been deleted.` }
    }
    session.lastAction = null
    return { text: strings.success.undone() }
  } catch (error) {
    console.error('[NLU Handler] Error deleting last:', error)
    return { text: strings.errors.generic() }
  }
}
