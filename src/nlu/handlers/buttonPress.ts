import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import type { BotResponse, ParsedEntities } from '../types'
import { strings } from '../../copy/strings'
import {
  getPendingConfirmation,
  clearPendingConfirmation,
  getPendingEdit,
  setPendingEdit,
  clearPendingEdit,
  setLastAction,
  getSession,
} from '../../session/store'
import {
  recordTransaction,
  softDeleteTransaction,
} from '../../services/transaction.service'
import { updateLedgerBudget } from '../../services/ledger.service'
import { sendBotResponse } from '../../response/builder'

type ButtonAction = 'save' | 'edit' | 'cancel' | 'undo'

/**
 * Handles numbered reply actions (1=Save, 2=Edit, 3=Cancel).
 * Called when a pending confirmation exists and user replies with 1/2/3.
 *
 * Phase 2: Text-based numbered confirmations (no native interactive buttons).
 */
export async function handleButtonPress(
  action: ButtonAction,
  groupJID: string,
  presserJID: string,
  presserName: string,
  userId: string,
  ledgerId: string,
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage
): Promise<void> {
  if (action === 'save') {
    await handleSave(groupJID, presserJID, presserName, userId, ledgerId, sock, remoteJid, msg)
  } else if (action === 'edit') {
    await handleEdit(groupJID, sock, remoteJid, msg)
  } else if (action === 'cancel') {
    await handleCancel(groupJID, sock, remoteJid, msg)
  } else if (action === 'undo') {
    await handleUndo(groupJID, ledgerId, sock, remoteJid, msg)
  }
}

async function handleSave(
  groupJID: string,
  presserJID: string,
  presserName: string,
  userId: string,
  ledgerId: string,
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage
): Promise<void> {
  const pending = getPendingConfirmation(groupJID)
  if (!pending) {
    await sendBotResponse(
      sock,
      remoteJid,
      { text: 'No pending confirmation found.' },
      msg
    )
    return
  }

  // Use the original creator's userId (not button presser's)
  // This preserves who originally logged the entry even if another group member saves the confirmation
  const creatorUserId = pending.createdByUserId

  try {
    const intent = pending.intent
    const entities = pending.entities

    if (intent === 'add_expense' || intent === 'add_income') {
      await handleSaveTransaction(
        groupJID,
        intent,
        entities,
        creatorUserId,
        ledgerId,
        sock,
        remoteJid,
        msg,
        presserName
      )
    } else if (intent === 'set_budget') {
      await handleSaveBudget(groupJID, ledgerId, entities, sock, remoteJid, msg)
    }
  } catch (error) {
    console.error('[ButtonPress] Error saving:', error)
    await sendBotResponse(
      sock,
      remoteJid,
      { text: strings.errors.generic() },
      msg
    )
  }
}

async function handleSaveTransaction(
  groupJID: string,
  intent: string,
  entities: ParsedEntities,
  userId: string,
  ledgerId: string,
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  presserName: string
): Promise<void> {
  if (!entities.amount) {
    await sendBotResponse(
      sock,
      remoteJid,
      { text: strings.errors.parseFailed() },
      msg
    )
    return
  }

  const category = entities.category || (intent === 'add_income' ? 'income' : 'other')
  const description = entities.description || entities.merchant || null

  try {
    // Generate a unique messageId for this confirmed entry
    // Use current timestamp + random suffix to avoid conflicts
    const messageId = `confirmed_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    // TODO: For multi-expense (entities.items), iterate and create atomic transaction
    const txn = await recordTransaction({
      ledgerId,
      userId,
      amount: entities.amount,
      category,
      description,
      transactionType: intent === 'add_income' ? 'income' : 'expense',
      messageId,
      rawMessage: `[confirmed via button press]`,
      aiParsedData: {} as any, // Simplified for Phase 2
    })

    // Set last action for undo (5-min window)
    const undoExpiresAt = Date.now() + 5 * 60 * 1000
    setLastAction(groupJID, {
      recordId: txn.id,
      intent,
      loggedBy: userId,
      at: Date.now(),
      undoExpiresAt,
    })

    // Clear pending
    clearPendingConfirmation(groupJID)

    // Reply with success + undo instructions
    const successText = strings.success.saved(
      {
        amount: txn.amount,
        category: txn.category,
        description: txn.description,
        transactionType: intent === 'add_income' ? 'income' : 'expense',
      },
      presserName
    )

    const response = {
      text: successText + `\n\n↶ Reply *undo* within 5 min to undo.`,
    }

    await sendBotResponse(sock, remoteJid, response, msg)
  } catch (error) {
    console.error('[ButtonPress] Error recording transaction:', error)
    await sendBotResponse(
      sock,
      remoteJid,
      { text: strings.errors.generic() },
      msg
    )
  }
}

async function handleSaveBudget(
  groupJID: string,
  ledgerId: string,
  entities: ParsedEntities,
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage
): Promise<void> {
  if (!entities.amount) {
    await sendBotResponse(
      sock,
      remoteJid,
      { text: 'Please specify a budget amount.' },
      msg
    )
    return
  }

  try {
    await updateLedgerBudget(ledgerId, entities.amount)
    const response = {
      text: strings.success.budgetSet(entities.amount),
    }

    clearPendingConfirmation(groupJID)
    await sendBotResponse(sock, remoteJid, response, msg)
  } catch (error) {
    console.error('[ButtonPress] Error setting budget:', error)
    await sendBotResponse(
      sock,
      remoteJid,
      { text: strings.errors.generic() },
      msg
    )
  }
}

async function handleEdit(
  groupJID: string,
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage
): Promise<void> {
  const pending = getPendingConfirmation(groupJID)
  if (!pending) {
    await sendBotResponse(
      sock,
      remoteJid,
      { text: 'No pending confirmation to edit.' },
      msg
    )
    return
  }

  // Set edit state to "choosing field"
  setPendingEdit(groupJID, pending.id, null)

  const editPrompt = `What to change?\n\n*1* Amount\n*2* Category\n*3* Merchant\n*4* Date`

  await sendBotResponse(sock, remoteJid, { text: editPrompt }, msg)
}

async function handleCancel(
  groupJID: string,
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage
): Promise<void> {
  const pending = getPendingConfirmation(groupJID)
  if (!pending) {
    await sendBotResponse(
      sock,
      remoteJid,
      { text: 'No pending confirmation to cancel.' },
      msg
    )
    return
  }

  clearPendingConfirmation(groupJID)
  clearPendingEdit(groupJID)

  await sendBotResponse(sock, remoteJid, { text: 'Cancelled.' }, msg)
}

async function handleUndo(
  groupJID: string,
  ledgerId: string,
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage
): Promise<void> {
  const session = getSession(groupJID)
  const lastAction = session.lastAction

  if (!lastAction) {
    await sendBotResponse(
      sock,
      remoteJid,
      { text: 'No recent transaction to undo.' },
      msg
    )
    return
  }

  // Check undo window (5 min)
  if (Date.now() > lastAction.undoExpiresAt) {
    await sendBotResponse(
      sock,
      remoteJid,
      { text: strings.errors.undoExpired() },
      msg
    )
    return
  }

  try {
    const deleted = await softDeleteTransaction(lastAction.recordId, ledgerId)

    if (!deleted) {
      await sendBotResponse(
        sock,
        remoteJid,
        { text: 'Could not undo — transaction may have already been deleted.' },
        msg
      )
      return
    }

    session.lastAction = null
    session.lastActivityAt = Date.now()

    await sendBotResponse(
      sock,
      remoteJid,
      { text: strings.success.undone() },
      msg
    )
  } catch (error) {
    console.error('[ButtonPress] Error undoing:', error)
    await sendBotResponse(
      sock,
      remoteJid,
      { text: strings.errors.generic() },
      msg
    )
  }
}
