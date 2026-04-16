import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

export async function findOrCreateUser(phoneNumber: string, displayName?: string) {
  const existing = await db.query.users.findFirst({
    where: eq(users.phoneNumber, phoneNumber),
  })

  if (existing) {
    // Keep display name up-to-date with the user's WhatsApp push name
    if (displayName && displayName !== existing.displayName) {
      const [updated] = await db
        .update(users)
        .set({ displayName })
        .where(eq(users.id, existing.id))
        .returning()
      return updated
    }
    return existing
  }

  const [created] = await db
    .insert(users)
    .values({
      phoneNumber,
      displayName: displayName || null,
    })
    .returning()

  return created
}

export async function getUserById(userId: string) {
  return await db.query.users.findFirst({
    where: eq(users.id, userId),
  })
}

export async function getUserByPhoneNumber(phoneNumber: string) {
  return await db.query.users.findFirst({
    where: eq(users.phoneNumber, phoneNumber),
  })
}
