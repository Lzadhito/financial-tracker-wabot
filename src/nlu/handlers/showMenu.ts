import type { BotResponse } from '../types'

export async function handleShowMenu(): Promise<BotResponse> {
  const menuText = `📋 *What I can do:*

💰 *Log Expenses* (natural language)
• \`coffee 50k\` or \`50rb kopi\`
• \`spent 75k groceries\`
• \`lunch 35k, coffee 15k\` _(multiple)_
• \`coffee 50k yesterday\` _(backdate)_

📥 *Log Income*
• \`income 5jt salary\`
• \`gaji 5000000\`

📊 *View Summary*
• \`summary\` or \`report\`
• \`summary yesterday\`
• \`summary this week\`
• \`summary this month\`

📋 *List Transactions*
• \`list\` or \`show\`
• \`list yesterday\`
• \`list this week\`
• \`list this month\`

🎯 *Budget & Income Target*
• \`budget 2jt\`
• \`/set-income 5jt\`

↶ *Undo / Delete*
• \`undo\` _(within 5 min)_
• \`/delete beli kopi 16 april\`

⚙️ *Slash Commands*
/summary · /transactions · /income · /budget · /delete · /help

💡 Tip: Just type naturally — I understand Indonesian & English!`

  return { text: menuText }
}
