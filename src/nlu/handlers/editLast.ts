import type { BotResponse } from '../types'

export async function handleEditLast(): Promise<BotResponse> {
  // Phase 2 will implement full edit flow with interactive buttons.
  // For Phase 1, provide guidance on using slash commands.
  return {
    text: `Edit support is coming soon. For now, you can use /delete to remove an entry and re-log it.`,
  }
}
