import { db } from '../db'
import { transactions, users } from '../db/schema'
import { eq, and, gte, lte, lt, isNull, sql } from 'drizzle-orm'
import type { ParsedData } from '../ai/haiku'

export async function recordTransaction(data: {
  ledgerId: string
  userId: string
  amount: number
  category: string
  description: string | null
  transactionType: 'expense' | 'income'
  messageId: string
  rawMessage: string
  aiParsedData: ParsedData
}) {
  const [created] = await db
    .insert(transactions)
    .values({
      ledgerId: data.ledgerId,
      userId: data.userId,
      amount: data.amount,
      category: data.category,
      description: data.description,
      transactionType: data.transactionType,
      messageId: data.messageId,
      rawMessage: data.rawMessage,
      aiParsedData: data.aiParsedData as any,
    })
    .returning()

  return created
}

export async function findTransactionByMessageId(messageId: string) {
  return await db.query.transactions.findFirst({
    where: eq(transactions.messageId, messageId),
  })
}

export async function getTransactionsByLedger(ledgerId: string) {
  return await db.query.transactions.findMany({
    where: and(
      eq(transactions.ledgerId, ledgerId),
      isNull(transactions.deletedAt)
    ),
  })
}

export async function getTodayTransactions(ledgerId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  return await db.query.transactions.findMany({
    where: and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.createdAt, today),
      lt(transactions.createdAt, tomorrow),
      isNull(transactions.deletedAt)
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  })
}

export async function getWeekTransactions(ledgerId: string) {
  const today = new Date()
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)
  weekAgo.setHours(0, 0, 0, 0)

  return await db.query.transactions.findMany({
    where: and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.createdAt, weekAgo),
      lte(transactions.createdAt, today),
      isNull(transactions.deletedAt)
    ),
  })
}

export async function getMonthTransactions(ledgerId: string) {
  const today = new Date()
  const monthAgo = new Date(today)
  monthAgo.setMonth(monthAgo.getMonth() - 1)
  monthAgo.setHours(0, 0, 0, 0)

  return await db.query.transactions.findMany({
    where: and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.createdAt, monthAgo),
      isNull(transactions.deletedAt)
    ),
  })
}

export async function getCurrentMonthTransactions(ledgerId: string) {
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  return await db.query.transactions.findMany({
    where: and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.createdAt, monthStart),
      isNull(transactions.deletedAt)
    ),
  })
}

export async function getTransactionsByCategory(ledgerId: string, period: 'today' | 'week' | 'month') {
  let txns: typeof transactions.$inferSelect[] = []

  switch (period) {
    case 'today':
      txns = await getTodayTransactions(ledgerId)
      break
    case 'week':
      txns = await getWeekTransactions(ledgerId)
      break
    case 'month':
      txns = await getCurrentMonthTransactions(ledgerId)
      break
  }

  const byCategory: Record<string, number> = {}

  for (const txn of txns) {
    if (txn.transactionType === 'expense') {
      byCategory[txn.category] = (byCategory[txn.category] || 0) + txn.amount
    }
  }

  return byCategory
}

export async function getTransactionsByMember(ledgerId: string, period: 'today' | 'week' | 'month') {
  let txns: typeof transactions.$inferSelect[] = []

  switch (period) {
    case 'today':
      txns = await getTodayTransactions(ledgerId)
      break
    case 'week':
      txns = await getWeekTransactions(ledgerId)
      break
    case 'month':
      txns = await getCurrentMonthTransactions(ledgerId)
      break
  }

  const byMember: Record<string, { total: number; name: string }> = {}

  for (const txn of txns) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, txn.userId),
    })

    const name = user?.displayName || user?.phoneNumber || txn.userId

    if (!byMember[txn.userId]) {
      byMember[txn.userId] = { total: 0, name }
    }

    if (txn.transactionType === 'expense') {
      byMember[txn.userId].total += txn.amount
    }
  }

  return byMember
}

export async function getTotalExpensesByPeriod(ledgerId: string, period: 'today' | 'week' | 'month') {
  let txns: typeof transactions.$inferSelect[] = []

  switch (period) {
    case 'today':
      txns = await getTodayTransactions(ledgerId)
      break
    case 'week':
      txns = await getWeekTransactions(ledgerId)
      break
    case 'month':
      txns = await getCurrentMonthTransactions(ledgerId)
      break
  }

  return txns
    .filter((t) => t.transactionType === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)
}

export async function getTotalIncomeByPeriod(ledgerId: string, period: 'today' | 'week' | 'month') {
  let txns: typeof transactions.$inferSelect[] = []

  switch (period) {
    case 'today':
      txns = await getTodayTransactions(ledgerId)
      break
    case 'week':
      txns = await getWeekTransactions(ledgerId)
      break
    case 'month':
      txns = await getCurrentMonthTransactions(ledgerId)
      break
  }

  return txns
    .filter((t) => t.transactionType === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
}

// ─── Date-range queries ───────────────────────────────────────────────────────

export async function getTransactionsInRange(ledgerId: string, start: Date, end: Date) {
  return await db.query.transactions.findMany({
    where: and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.createdAt, start),
      lt(transactions.createdAt, end),
      isNull(transactions.deletedAt)
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  })
}

// For display only — includes soft-deleted transactions (shown with a flag)
export async function getAllTransactionsInRange(ledgerId: string, start: Date, end: Date) {
  return await db.query.transactions.findMany({
    where: and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.createdAt, start),
      lt(transactions.createdAt, end)
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  })
}

export type TransactionWithUser = typeof transactions.$inferSelect & {
  memberName: string
}

export async function getTransactionsWithUserInRange(
  ledgerId: string,
  start: Date,
  end: Date
): Promise<TransactionWithUser[]> {
  const txns = await getAllTransactionsInRange(ledgerId, start, end)

  // Batch-fetch unique users
  const userIds = [...new Set(txns.map((t) => t.userId))]
  const userMap: Record<string, string> = {}

  await Promise.all(
    userIds.map(async (uid) => {
      const user = await db.query.users.findFirst({ where: eq(users.id, uid) })
      userMap[uid] = user?.displayName || user?.phoneNumber || uid
    })
  )

  return txns.map((t) => ({ ...t, memberName: userMap[t.userId] || t.userId }))
}

export async function getTotalByTypeInRange(
  ledgerId: string,
  start: Date,
  end: Date,
  type: 'income' | 'expense'
): Promise<number> {
  const txns = await getTransactionsInRange(ledgerId, start, end)
  return txns
    .filter((t) => t.transactionType === type)
    .reduce((sum, t) => sum + t.amount, 0)
}

export async function getByTypeInRange(
  ledgerId: string,
  start: Date,
  end: Date,
  type: 'income' | 'expense'
): Promise<TransactionWithUser[]> {
  const all = await getTransactionsWithUserInRange(ledgerId, start, end)
  return all.filter((t) => t.transactionType === type)
}

export async function findTransactionsByNameAndTime(
  ledgerId: string,
  query: string,
  start: Date,
  end: Date
) {
  const txns = await db.query.transactions.findMany({
    where: and(
      eq(transactions.ledgerId, ledgerId),
      gte(transactions.createdAt, start),
      lt(transactions.createdAt, end),
      isNull(transactions.deletedAt)
    ),
  })

  const lowerQuery = query.toLowerCase()
  return txns.filter(
    (t) =>
      t.description?.toLowerCase().includes(lowerQuery) ||
      t.rawMessage.toLowerCase().includes(lowerQuery) ||
      t.category.toLowerCase().includes(lowerQuery)
  )
}

export async function findTransactionsByName(ledgerId: string, query: string) {
  const txns = await db.query.transactions.findMany({
    where: and(
      eq(transactions.ledgerId, ledgerId),
      isNull(transactions.deletedAt)
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  })

  const lowerQuery = query.toLowerCase()
  return txns.filter(
    (t) =>
      t.description?.toLowerCase().includes(lowerQuery) ||
      t.rawMessage.toLowerCase().includes(lowerQuery) ||
      t.category.toLowerCase().includes(lowerQuery)
  )
}

export async function softDeleteTransaction(transactionId: string, ledgerId: string) {
  const [updated] = await db
    .update(transactions)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.ledgerId, ledgerId),
        isNull(transactions.deletedAt)
      )
    )
    .returning()

  return updated ?? null
}
