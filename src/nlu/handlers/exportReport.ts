import type { BotResponse } from '../types'

export async function handleExportReport(): Promise<BotResponse> {
  return {
    text: `Export is not available yet. Use /summary or /transactions to view your data.`,
  }
}
