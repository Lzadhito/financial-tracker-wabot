import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

export async function findOrCreateUser(phoneNumber: string, displayName?: string) {
  const existing = await db.query.users.findFirst({
    where: eq(users.phoneNumber, phoneNumber),
  })

  if (existing) {
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
