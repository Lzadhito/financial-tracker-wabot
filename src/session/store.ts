import type { ParsedEntities } from '../nlu/types'

// OWNERSHIP MODEL: one WhatsApp group = one ledger, keyed by group JID.
// Entries tagged with logged_by (sender JID) for by-member reporting.
// Any group member can edit/undo any entry. No per-entry privacy.
// Deliberate product decision — do not extend without owner approval.

export interface SessionTurn {
  role: 'user' | 'bot'
  senderJID?: string
  text?: string
  intent?: string
  entities?: ParsedEntities
  at: number // epoch ms
}

export interface GroupSession {
  contextStack: SessionTurn[]
  lastAction: {
    recordId: string
    intent: string
    loggedBy: string
    at: number
    undoExpiresAt: number
  } | null
  pendingConfirmation: {
    id: string
    intent: string
    entities: ParsedEntities
    createdBy: string // sender JID
    createdByUserId: string // user ID for logging (any group member can save)
    createdAt: number
  } | null
  pendingEdit: {
    confirmationId: string
    field: string
    at: number
  } | null
  lastActivityAt: number
}

const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes
const MAX_CONTEXT_TURNS = 5

const sessions = new Map<string, GroupSession>()

// TODO: Multi-instance deployment — move to Redis or similar shared store.

function createEmptySession(): GroupSession {
  return {
    contextStack: [],
    lastAction: null,
    pendingConfirmation: null,
    pendingEdit: null,
    lastActivityAt: Date.now(),
  }
}

function isExpired(session: GroupSession): boolean {
  return Date.now() - session.lastActivityAt > SESSION_TTL_MS
}

export function getSession(groupJID: string): GroupSession {
  const existing = sessions.get(groupJID)
  if (existing && !isExpired(existing)) {
    return existing
  }
  const fresh = createEmptySession()
  sessions.set(groupJID, fresh)
  return fresh
}

export function addUserTurn(
  groupJID: string,
  senderJID: string,
  text: string
): void {
  const session = getSession(groupJID)
  session.contextStack.push({
    role: 'user',
    senderJID,
    text,
    at: Date.now(),
  })
  if (session.contextStack.length > MAX_CONTEXT_TURNS) {
    session.contextStack.shift()
  }
  session.lastActivityAt = Date.now()
}

export function addBotTurn(
  groupJID: string,
  intent: string,
  entities?: ParsedEntities
): void {
  const session = getSession(groupJID)
  session.contextStack.push({
    role: 'bot',
    intent,
    entities,
    at: Date.now(),
  })
  if (session.contextStack.length > MAX_CONTEXT_TURNS) {
    session.contextStack.shift()
  }
  session.lastActivityAt = Date.now()
}

export function getRecentTurns(
  groupJID: string,
  count: number = 3
): SessionTurn[] {
  const session = getSession(groupJID)
  return session.contextStack.slice(-count)
}

export function setLastAction(
  groupJID: string,
  action: GroupSession['lastAction']
): void {
  const session = getSession(groupJID)
  session.lastAction = action
  session.lastActivityAt = Date.now()
}

export function clearSession(groupJID: string): void {
  sessions.delete(groupJID)
}

/**
 * Pending confirmation helpers — Phase 2
 */
export function setPendingConfirmation(
  groupJID: string,
  id: string,
  intent: string,
  entities: ParsedEntities,
  createdBy: string,
  createdByUserId: string
): void {
  const session = getSession(groupJID)
  session.pendingConfirmation = {
    id,
    intent,
    entities,
    createdBy,
    createdByUserId,
    createdAt: Date.now(),
  }
  session.lastActivityAt = Date.now()
}

export function getPendingConfirmation(
  groupJID: string
): GroupSession['pendingConfirmation'] {
  const session = getSession(groupJID)
  return session.pendingConfirmation
}

export function clearPendingConfirmation(groupJID: string): void {
  const session = getSession(groupJID)
  session.pendingConfirmation = null
  session.lastActivityAt = Date.now()
}

/**
 * Pending edit helpers — Phase 2
 */
export function setPendingEdit(
  groupJID: string,
  confirmationId: string,
  field: string | null
): void {
  const session = getSession(groupJID)
  session.pendingEdit = {
    confirmationId,
    field,
    at: Date.now(),
  }
  session.lastActivityAt = Date.now()
}

export function getPendingEdit(
  groupJID: string
): GroupSession['pendingEdit'] {
  const session = getSession(groupJID)
  return session.pendingEdit
}

export function clearPendingEdit(groupJID: string): void {
  const session = getSession(groupJID)
  session.pendingEdit = null
  session.lastActivityAt = Date.now()
}

/**
 * Periodic cleanup of expired sessions.
 * Called on a timer to prevent memory leaks in long-running bot.
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now()
  for (const [key, session] of sessions) {
    if (now - session.lastActivityAt > SESSION_TTL_MS) {
      sessions.delete(key)
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupExpiredSessions, 10 * 60 * 1000)
