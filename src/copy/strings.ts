/**
 * All user-facing English strings.
 * No inline literals in handler code — everything goes through here.
 */

import { isSameDay } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { formatAmountIDR } from '../nlu/indonesianNormalizer'
import type { ParsedEntities, ExpenseItem } from '../nlu/types'

function formatDate(d: Date): string {
  const now = new Date()
  const isToday = isSameDay(d, now)
  const time = formatInTimeZone(d, 'UTC', 'HH:mm')

  if (isToday) return `Today, ${time}`

  return formatInTimeZone(d, 'UTC', 'MMM d, yyyy') + `, ${time}`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function categoryDisplay(cat: string): string {
  const map: Record<string, string> = {
    food: 'Food & Drink',
    transport: 'Transport',
    bills: 'Bills & Utilities',
    shopping: 'Shopping',
    entertainment: 'Entertainment',
    health: 'Health',
    education: 'Education',
    other: 'Other',
  }
  return map[cat] || capitalize(cat)
}

function categoryEmoji(cat: string): string {
  const map: Record<string, string> = {
    food: '☕',
    transport: '🚗',
    bills: '📄',
    shopping: '🛍️',
    entertainment: '🎮',
    health: '⚕️',
    education: '📚',
    other: '📌',
  }
  return map[cat] || '📌'
}

export const strings = {
  formatAmount: formatAmountIDR,
  formatDate,

  greetings: {
    menu: () =>
      `Hi 👋 I can help your household with:\n\n` +
      `• 💰 Log an expense\n` +
      `• 💵 Log income\n` +
      `• 📊 View reports\n` +
      `• 🎯 Set a budget\n` +
      `• 📤 Export data\n` +
      `• ⚙️ Settings\n` +
      `• ❓ How to use\n\n` +
      `Try sending something like: \`coffee 50k\` or \`lunch 35000\``,
  },

  confirmation: {
    expense: (entities: ParsedEntities, loggerName: string) => {
      const cat = entities.category || 'other'
      const desc = entities.description || entities.merchant || 'Expense'
      const emoji = categoryEmoji(cat)
      const amount = entities.amount ? formatAmountIDR(entities.amount) : 'Unknown'
      const now = formatDate(new Date())
      return (
        `Expense detected\n` +
        `${emoji} ${desc} — ${amount}\n` +
        `Category: ${categoryDisplay(cat)}\n` +
        `Logged by: ${loggerName}\n` +
        `${now}`
      )
    },

    instructions: () =>
      `\n\nReply with:\n*1* ✓ Save\n*2* ✎ Edit\n*3* ✗ Cancel`,

    income: (entities: ParsedEntities, loggerName: string) => {
      const desc = entities.description || 'Income'
      const amount = entities.amount ? formatAmountIDR(entities.amount) : 'Unknown'
      const now = formatDate(new Date())
      return (
        `Income detected\n` +
        `💵 ${desc} — ${amount}\n` +
        `Logged by: ${loggerName}\n` +
        `${now}`
      )
    },

    budget: (entities: ParsedEntities, loggerName: string) => {
      const amount = entities.amount ? formatAmountIDR(entities.amount) : 'Unknown'
      return (
        `Budget update\n` +
        `🎯 Monthly budget — ${amount}\n` +
        `Set by: ${loggerName}`
      )
    },

    multiExpense: (items: ExpenseItem[], loggerName: string) => {
      const now = formatDate(new Date())
      let text = `Multiple expenses detected\n`
      for (const item of items) {
        const cat = item.category || 'other'
        const desc = item.merchant || categoryDisplay(cat)
        text += `${categoryEmoji(cat)} ${desc} — ${formatAmountIDR(item.amount)}\n`
      }
      const total = items.reduce((s, i) => s + i.amount, 0)
      text += `Total: ${formatAmountIDR(total)}\n`
      text += `Logged by: ${loggerName}\n`
      text += now
      return text
    },
  },

  success: {
    saved: (record: { amount: number; category: string; description?: string | null; transactionType: string }, loggerName: string) => {
      const emoji = record.transactionType === 'income' ? '📥' : '📤'
      const typeLabel = capitalize(record.transactionType)
      return (
        `${emoji} *${typeLabel} logged*\n\n` +
        `Amount: ${formatAmountIDR(record.amount)}\n` +
        `Category: ${categoryDisplay(record.category)}` +
        (record.description ? `\nMemo: ${record.description}` : '') +
        `\nLogged by: ${loggerName}`
      )
    },
    undone: () => `↶ Transaction undone successfully.`,
    polishingNotice: () =>
      `\n\n_🔧 Sistem ini masih terus disempurnakan. Ada saran atau nemuin masalah? Kasih tahu admin ya!_ 🙏`,
    budgetSet: (amount: number) =>
      `✅ *Monthly budget set*\n\nBudget: ${formatAmountIDR(amount)}`,
    incomeSet: (amount: number) =>
      `✅ *Monthly income set*\n\nIncome: ${formatAmountIDR(amount)}`,
  },

  errors: {
    undoExpired: () => `The undo window has expired. You can use /delete to remove entries.`,
    parseFailed: () =>
      `I didn't quite catch that. You can try something like: \`coffee 50k\` or \`lunch 35000 at Kopi Kenangan\`. Or send \`menu\` to see options.`,
    mediaNotSupported: () =>
      `I can't process voice notes or photos yet. Please type your expense — something like \`coffee 50k\`.`,
    generic: () => `Something went wrong. Please try again.`,
  },

  clarify: {
    bareNumber: () =>
      `Did you mean Rp 350 or Rp 350,000? And what was it for?`,
    missingAmount: (merchant: string) =>
      `Got it — how much did you spend at ${merchant}?`,
    generic: () =>
      `I didn't quite catch that. You can try something like: \`coffee 50k\` or \`lunch 35000 at Kopi Kenangan\`. Or send \`menu\` to see options.`,
  },

  reports: {
    monthly: (summary: {
      totalSpent: number
      totalIncome: number
      net: number
      categories: Array<{ name: string; amount: number }>
    }) => {
      let text = `📊 This month's summary\n`
      text += `Spent: ${formatAmountIDR(summary.totalSpent)}\n`
      text += `Income: ${formatAmountIDR(summary.totalIncome)}\n`
      text += `Net: ${formatAmountIDR(summary.net)}\n`

      if (summary.categories.length > 0) {
        text += `\nTop categories:\n`
        for (const cat of summary.categories) {
          text += `• ${categoryDisplay(cat.name)} — ${formatAmountIDR(cat.amount)}\n`
        }
      }
      return text
    },

    byMember: (breakdown: Array<{ name: string; spent: number; entries: number }>) => {
      let text = `📊 By member, this month\n`
      for (const m of breakdown) {
        text += `${m.name}: ${formatAmountIDR(m.spent)} spent · ${m.entries} entries\n`
      }
      return text
    },
  },
}
