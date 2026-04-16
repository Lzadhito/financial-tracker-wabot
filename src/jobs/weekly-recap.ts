import { db } from '../db'
import { getCurrentSocket } from '../whatsapp/client'
import { sql } from 'drizzle-orm'
import { groupChats, ledgers, users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { getTotalExpensesByPeriod, getTransactionsByCategory } from '../services/transaction.service'
import { getLedgerMembers } from '../services/ledger.service'
import { sendTextReply } from '../whatsapp/sender'

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}

function categoryEmoji(category: string): string {
  const map: Record<string, string> = {
    food: '🍜',
    transport: '🚗',
    bills: '📄',
    shopping: '🛍️',
    entertainment: '🎮',
    health: '⚕️',
    education: '📚',
    income: '💰',
    other: '📌',
  }
  return map[category] || '📌'
}

async function buildWeeklySummary(ledgerId: string): Promise<string> {
  const ledger = await db.query.ledgers.findFirst({
    where: eq(ledgers.id, ledgerId),
  })

  if (!ledger) return ''

  const totalExpenses = await getTotalExpensesByPeriod(ledgerId, 'week')
  const byCategory = await getTransactionsByCategory(ledgerId, 'week')

  const today = new Date()
  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - 7)

  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const dateStr = `${weekStart.toLocaleDateString('en-US', options)}–${today.toLocaleDateString(
    'en-US',
    options
  )}`

  let text = `📊 *Weekly Summary (${dateStr})*\n\n`
  text += `Total spent: ${formatRupiah(totalExpenses)}\n`

  if (ledger.monthlyBudget) {
    const remaining = ledger.monthlyBudget - totalExpenses
    text += `Budget remaining: ${formatRupiah(Math.max(0, remaining))}\n`
  }

  if (Object.keys(byCategory).length > 0) {
    text += `\n*By category:*\n`

    for (const [category, amount] of Object.entries(byCategory)) {
      text += `${categoryEmoji(category)} ${category.charAt(0).toUpperCase() + category.slice(1)}: ${formatRupiah(amount)}\n`
    }
  }

  const members = await getLedgerMembers(ledgerId)
  if (members.length > 1) {
    text += `\n*Members:* ${members.length}`
  }

  return text
}

export function startWeeklyRecapJob() {
  Bun.cron('0 20 * * 0', async () => {
    console.log('[Weekly Recap] Job started')

    try {
      // Get all ledgers with recent transactions
      const result = await db.execute(
        sql`
          SELECT DISTINCT l.id FROM ledgers l
          INNER JOIN transactions t ON l.id = t.ledger_id
          WHERE t.created_at >= NOW() - INTERVAL '7 days'
        `
      )

      const ledgerIds: { id: string }[] = result as any[]

      console.log(`[Weekly Recap] Found ${ledgerIds.length} active ledgers`)

      let messageCount = 0
      const rate_limit_delay = 3000 // 3 seconds between messages

      for (const { id: ledgerId } of ledgerIds) {
        try {
          const summary = await buildWeeklySummary(ledgerId)
          if (!summary) continue

          // Check if group or personal ledger
          const groupChat = await db.query.groupChats.findFirst({
            where: eq(groupChats.ledgerId, ledgerId),
          })

          let targetJid: string | null = null

          if (groupChat) {
            // Send to group
            targetJid = groupChat.whatsappGroupId
          } else {
            // Find owner for DM
            const members = await getLedgerMembers(ledgerId)
            const owner = members.find((m) => m.role === 'owner')

            if (owner) {
              const user = await db.query.users.findFirst({
                where: eq(users.id, owner.userId),
              })

              if (user) {
                targetJid = `${user.phoneNumber}@s.whatsapp.net`
              }
            }
          }

          if (targetJid) {
            const sock = getCurrentSocket()
            if (!sock) continue
            await sock.sendPresenceUpdate('composing', targetJid)
            await sock.sendMessage(targetJid, { text: summary })
            await sock.sendPresenceUpdate('paused', targetJid)

            messageCount++

            // Rate limit: max 20 messages per minute
            if (messageCount % 20 === 0) {
              console.log(`[Weekly Recap] Sent ${messageCount} messages, rate limiting...`)
              await Bun.sleep(rate_limit_delay)
            } else {
              await Bun.sleep(rate_limit_delay)
            }
          }
        } catch (error) {
          console.error('[Weekly Recap] Error processing ledger:', error)
        }
      }

      console.log(`[Weekly Recap] Job completed, sent ${messageCount} messages`)
    } catch (error) {
      console.error('[Weekly Recap] Job failed:', error)
    }
  })
}
