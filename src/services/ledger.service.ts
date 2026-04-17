import { db } from '../db'
import {
  ledgers,
  ledgerMembers,
  groupChats,
  ledgerSettings,
} from '../db/schema'
import { eq, and } from 'drizzle-orm'

export async function createLedger(
  name?: string,
  monthlyIncome?: number,
  monthlyBudget?: number
) {
  const [created] = await db
    .insert(ledgers)
    .values({
      name: name || null,
      monthlyIncome: monthlyIncome || null,
      monthlyBudget: monthlyBudget || null,
    })
    .returning()

  return created
}

export async function getLedgerById(ledgerId: string) {
  return await db.query.ledgers.findFirst({
    where: eq(ledgers.id, ledgerId),
  })
}

export async function addLedgerMember(
  ledgerId: string,
  userId: string,
  role: 'owner' | 'member' = 'member'
) {
  const [created] = await db
    .insert(ledgerMembers)
    .values({
      ledgerId,
      userId,
      role,
    })
    .returning()

  return created
}

export async function getLedgerMembers(ledgerId: string) {
  return await db.query.ledgerMembers.findMany({
    where: eq(ledgerMembers.ledgerId, ledgerId),
  })
}

export async function getMembersWithDisplayNames(
  ledgerId: string
): Promise<{ userId: string; displayName: string }[]> {
  const members = await db.query.ledgerMembers.findMany({
    where: eq(ledgerMembers.ledgerId, ledgerId),
    with: { user: true },
  })
  return members.map((m) => ({
    userId: m.userId,
    displayName: m.user?.displayName || m.user?.phoneNumber || m.userId,
  }))
}

export async function getUserLedgers(userId: string) {
  return await db
    .select({
      ledger: ledgers,
      role: ledgerMembers.role,
    })
    .from(ledgerMembers)
    .where(eq(ledgerMembers.userId, userId))
    .leftJoin(ledgers, eq(ledgers.id, ledgerMembers.ledgerId))
}

export async function getGroupLedger(groupJid: string) {
  return await db.query.groupChats.findFirst({
    where: eq(groupChats.whatsappGroupId, groupJid),
    with: {
      ledger: true,
    },
  })
}

export async function createGroupChat(ledgerId: string, whatsappGroupId: string) {
  const [created] = await db
    .insert(groupChats)
    .values({
      ledgerId,
      whatsappGroupId,
    })
    .returning()

  return created
}

export async function updateLedgerBudget(ledgerId: string, monthlyBudget: number) {
  const [updated] = await db
    .update(ledgers)
    .set({ monthlyBudget })
    .where(eq(ledgers.id, ledgerId))
    .returning()

  return updated
}

export async function updateLedgerIncome(ledgerId: string, monthlyIncome: number) {
  const [updated] = await db
    .update(ledgers)
    .set({ monthlyIncome })
    .where(eq(ledgers.id, ledgerId))
    .returning()

  return updated
}

export async function setLedgerSetting(ledgerId: string, key: string, value: string) {
  await db
    .insert(ledgerSettings)
    .values({ ledgerId, key, value })
    .onConflictDoUpdate({
      target: [ledgerSettings.ledgerId, ledgerSettings.key],
      set: { value },
    })
}

export async function getLedgerSetting(ledgerId: string, key: string) {
  return await db.query.ledgerSettings.findFirst({
    where: and(eq(ledgerSettings.ledgerId, ledgerId), eq(ledgerSettings.key, key)),
  })
}
