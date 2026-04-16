import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { findTransactionsByNameAndTime, findTransactionsByName, softDeleteTransaction } from '../services/transaction.service'
import { sendTextReply } from '../whatsapp/sender'
import { parseDeleteQueryWithOllama } from '../ai/ollama'

interface ParsedQuery {
  description: string
  start?: Date
  end?: Date
}

async function parseDeleteArgs(args: string[]): Promise<ParsedQuery | null> {
  const text = args.join(' ').trim()
  if (!text) return null

  const today = new Date()
  const result = await parseDeleteQueryWithOllama(text, today)
  if (!result) return null

  // Name-only: no date provided
  if (result.day === null || result.month === null) {
    return { description: result.description }
  }

  const year = result.year ?? today.getFullYear()

  let start: Date
  let end: Date

  if (result.hour !== null && result.minute !== null) {
    // ±5 minute window around specified time
    start = new Date(year, result.month - 1, result.day, result.hour, result.minute - 5, 0, 0)
    end = new Date(year, result.month - 1, result.day, result.hour, result.minute + 5, 59, 999)
  } else {
    // whole day
    start = new Date(year, result.month - 1, result.day, 0, 0, 0, 0)
    end = new Date(year, result.month - 1, result.day + 1, 0, 0, 0, 0)
  }

  return { description: result.description, start, end }
}


export async function handleDeleteTransaction(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  ledgerId: string,
  args: string[]
) {
  if (args.length === 0) {
    await sendTextReply(
      sock,
      remoteJid,
      'Usage: /delete <name> [<day> <month>] [HH:MM]\n\nExamples:\n• /delete beli kopi\n• /delete beli kopi 16 april 15:03\n• /delete makan siang hari ini',
      msg
    )
    return
  }

  const parsed = await parseDeleteArgs(args)

  if (!parsed) {
    await sendTextReply(
      sock,
      remoteJid,
      'Could not understand the command. Try: /delete <name> or /delete <name> <day> <month> [HH:MM]',
      msg
    )
    return
  }

  try {
    const matches = parsed.start && parsed.end
      ? await findTransactionsByNameAndTime(ledgerId, parsed.description, parsed.start, parsed.end)
      : await findTransactionsByName(ledgerId, parsed.description)

    if (matches.length === 0) {
      await sendTextReply(
        sock,
        remoteJid,
        `No transaction found matching "${parsed.description}".`,
        msg
      )
      return
    }

    if (matches.length > 1) {
      const list = matches
        .map((t, i) => {
          const date = t.createdAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
          const time = t.createdAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          const desc = t.description || t.rawMessage
          return `${i + 1}. ${formatRupiah(t.amount)} — ${desc} (${date}, ${time})`
        })
        .join('\n')

      await sendTextReply(
        sock,
        remoteJid,
        `Found ${matches.length} matching transactions — please be more specific (add date/time):\n\n${list}`,
        msg
      )
      return
    }

    const txn = matches[0]

    const deleted = await softDeleteTransaction(txn.id, ledgerId)

    if (!deleted) {
      await sendTextReply(sock, remoteJid, 'Could not delete transaction. Please try again.', msg)
      return
    }

    const typeEmoji = txn.transactionType === 'income' ? '📥' : '📤'
    const desc = txn.description || txn.rawMessage
    const dateStr = txn.createdAt.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    const timeStr = txn.createdAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

    await sendTextReply(
      sock,
      remoteJid,
      `🗑️  *Transaction deleted*\n\n${typeEmoji} ${formatRupiah(txn.amount)} — ${desc}\nCategory: ${txn.category}\nDate: ${dateStr}, ${timeStr}`,
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
