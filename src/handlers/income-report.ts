import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { getByTypeInRange, getTotalByTypeInRange } from '../services/transaction.service'
import { sendTextReply } from '../whatsapp/sender'
import { type DateFilter, dateFilterToRange } from '../utils/date-filter'

export async function handleIncomeReport(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  ledgerId: string,
  filter: DateFilter = { type: 'period', period: 'month' }
) {
  try {
    const { start, end, label } = dateFilterToRange(filter)

    const txns = await getByTypeInRange(ledgerId, start, end, 'income')
    const total = await getTotalByTypeInRange(ledgerId, start, end, 'income')

    if (txns.length === 0) {
      await sendTextReply(sock, remoteJid, `📥 No income recorded for *${label}*.`, msg)
      return
    }

    let replyText = `📥 *Income — ${label}*\n\n`
    replyText += `Total: ${formatRupiah(total)}\n`

    // Per-member breakdown (only show if multiple members)
    const byMember: Record<string, { total: number; name: string; count: number }> = {}
    for (const txn of txns) {
      if (!byMember[txn.userId]) {
        byMember[txn.userId] = { total: 0, name: txn.memberName, count: 0 }
      }
      byMember[txn.userId].total += txn.amount
      byMember[txn.userId].count += 1
    }

    const memberEntries = Object.values(byMember)
    if (memberEntries.length > 1) {
      replyText += `\n*By member:*\n`
      for (const { name, total: memberTotal } of memberEntries) {
        replyText += `• ${name}: ${formatRupiah(memberTotal)}\n`
      }
    }

    // Transaction details (show up to 10 most recent)
    replyText += `\n*Entries:*\n`
    const displayed = txns.slice(0, 10)
    for (const txn of displayed) {
      const dateStr = txn.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
      const desc = txn.description || txn.category
      replyText += `• ${dateStr} | ${txn.memberName} | ${formatRupiah(txn.amount)} — ${desc}\n`
    }

    if (txns.length > 10) {
      replyText += `_...and ${txns.length - 10} more_\n`
    }

    await sendTextReply(sock, remoteJid, replyText, msg)
  } catch (error) {
    console.error('[Handler] Error generating income report:', error)
    await sendTextReply(sock, remoteJid, 'Something went wrong. Please try again.')
  }
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}
