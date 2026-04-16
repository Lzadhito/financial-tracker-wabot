import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { getTransactionByShortId, softDeleteTransaction } from '../services/transaction.service'
import { sendTextReply } from '../whatsapp/sender'

export async function handleDeleteTransaction(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  ledgerId: string,
  args: string[]
) {
  if (args.length === 0 || !args[0]) {
    await sendTextReply(
      sock,
      remoteJid,
      'Usage: /delete <id>\n\nGet the ID from /transactions (e.g. /delete abc12345).',
      msg
    )
    return
  }

  const shortId = args[0].toLowerCase()

  if (!/^[0-9a-f]{8}$/.test(shortId)) {
    await sendTextReply(
      sock,
      remoteJid,
      `Invalid ID: "${shortId}". Must be the 8-character code shown in /transactions.`,
      msg
    )
    return
  }

  try {
    const txn = await getTransactionByShortId(shortId, ledgerId)

    if (!txn) {
      await sendTextReply(
        sock,
        remoteJid,
        `No transaction found with ID "${shortId}".`,
        msg
      )
      return
    }

    if (txn.deletedAt !== null) {
      await sendTextReply(
        sock,
        remoteJid,
        `Transaction "${shortId}" is already deleted.`,
        msg
      )
      return
    }

    const deleted = await softDeleteTransaction(txn.id, ledgerId)

    if (!deleted) {
      await sendTextReply(sock, remoteJid, `Could not delete "${shortId}". Please try again.`, msg)
      return
    }

    const typeEmoji = txn.transactionType === 'income' ? '📥' : '📤'
    const desc = txn.description || txn.category
    const dateStr = txn.createdAt.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    })

    await sendTextReply(
      sock,
      remoteJid,
      `🗑️  *Transaction deleted*\n\nID: ${shortId}\n${typeEmoji} ${formatRupiah(txn.amount)} — ${desc}\nCategory: ${txn.category}\nDate: ${dateStr}`,
      msg
    )
  } catch (error) {
    console.error('[Handler] Error deleting transaction:', error)
    await sendTextReply(sock, remoteJid, 'Something went wrong. Please try again.', msg)
  }
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}
