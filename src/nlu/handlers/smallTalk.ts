import type { BotResponse } from '../types'

export async function handleSmallTalk(): Promise<BotResponse> {
  return {
    text: `Hey! I'm here to help track your finances. Send \`menu\` to see what I can do, or just tell me about an expense like \`coffee 50k\`.`,
  }
}
