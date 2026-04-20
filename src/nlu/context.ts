import type { SessionTurn } from '../session/store'

/**
 * Formats the last N session turns into a string for the Haiku prompt context.
 */
export function formatSessionContext(turns: SessionTurn[]): string {
  if (!turns || turns.length === 0) return '(no prior context)'

  return turns
    .map((t) => {
      if (t.role === 'user') {
        return `User: ${t.text}`
      }
      return `Bot: [intent=${t.intent}]${t.entities ? ` entities=${JSON.stringify(t.entities)}` : ''}`
    })
    .join('\n')
}
