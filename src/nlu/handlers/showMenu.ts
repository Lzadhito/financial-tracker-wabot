import type { BotResponse } from '../types'
import { strings } from '../../copy/strings'

export async function handleShowMenu(): Promise<BotResponse> {
  const menuText = `${strings.greetings.menu()}

Examples:
• *Log expense*: "coffee 50k" or "lunch 35000 at Kopi Kenangan"
• *View spending*: "report" or "spending this month"
• *Check balance*: "budget" or "how much left"
• *List today*: "show" or "list"
• *Set budget*: "budget 2jt"
• *Undo*: reply "undo" within 5 min of logging`

  return { text: menuText }
}
