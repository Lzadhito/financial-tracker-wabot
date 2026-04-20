import { fastPath } from './fastPath'
import { classifyWithHaiku } from './haiku'
import { formatSessionContext } from './context'
import { getRecentTurns } from '../session/store'
import type { ParsedIntent } from './types'

/**
 * Main NLU entry point.
 *
 * classify(text, senderJID, groupJID) → ParsedIntent
 *
 * 1. Try the fast-path regex parser
 * 2. If null, fall back to Haiku LLM
 */
export async function classify(
  text: string,
  senderJID: string,
  groupJID: string
): Promise<ParsedIntent> {
  // Fast path — regex only, no LLM cost
  const fastResult = fastPath(text)
  if (fastResult) {
    return fastResult
  }

  // Build context from recent turns
  const recentTurns = getRecentTurns(groupJID, 3)
  const contextString = formatSessionContext(recentTurns)

  // Haiku fallback
  return classifyWithHaiku(text, contextString)
}
