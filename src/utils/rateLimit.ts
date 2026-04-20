const WINDOW_MS = 30 * 1000 // 30 seconds
const MAX_MSGS = 10

interface RateLimitEntry {
  count: number
  windowStart: number
}

const limits = new Map<string, RateLimitEntry>()

export function isRateLimited(groupJID: string): boolean {
  const now = Date.now()
  const entry = limits.get(groupJID)

  if (!entry) {
    limits.set(groupJID, { count: 1, windowStart: now })
    return false
  }

  // Window expired, reset
  if (now - entry.windowStart > WINDOW_MS) {
    limits.set(groupJID, { count: 1, windowStart: now })
    return false
  }

  // Within window, check limit
  if (entry.count >= MAX_MSGS) {
    return true
  }

  entry.count++
  return false
}

export function getRateLimitMessage(): string {
  return `⏱️ Too many messages. Please slow down and try again in a moment.`
}
