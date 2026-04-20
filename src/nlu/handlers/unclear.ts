import type { ParsedIntent, BotResponse } from '../types'
import { strings } from '../../copy/strings'

export async function handleUnclear(parsed: ParsedIntent): Promise<BotResponse> {
  const text = parsed.clarification || strings.clarify.generic()
  return { text }
}
