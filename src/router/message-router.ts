import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { parseMessageWithOllama, type ParsedData } from '../ai/ollama'
import { handleHelp } from '../handlers/help'
import { handleQuerySummary } from '../handlers/summary'
import { handleSetBudget, handleSetIncome } from '../handlers/budget'
import { handleLogTransaction } from '../handlers/transaction'
import { sendTextReply } from '../whatsapp/sender'

export interface SlashCommandResult {
  type: 'slash_command'
  command: string
  args: string[]
}

export interface AiParseResult {
  type: 'ai_parse'
  parsed: ParsedData
}

export type RouterResult = SlashCommandResult | AiParseResult | null

export function tryParseSlashCommand(text: string): SlashCommandResult | null {
  if (!text.startsWith('/')) {
    return null
  }

  const parts = text.trim().split(/\s+/)
  const command = parts[0].slice(1).toLowerCase()
  const args = parts.slice(1)

  return { type: 'slash_command', command, args }
}

export async function routeMessage(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  userId: string,
  ledgerId: string,
  messageId: string,
  text: string,
  phoneNumber: string
): Promise<void> {
  console.log(`[Router] [${messageId}] routeMessage called — text: "${text}", userId: ${userId}, ledgerId: ${ledgerId}`)

  // Try slash command first
  const slashResult = tryParseSlashCommand(text)

  if (slashResult) {
    console.log(`[Router] [${messageId}] Slash command detected — command: /${slashResult.command}, args: [${slashResult.args.join(', ')}]`)
    await handleSlashCommand(sock, remoteJid, msg, ledgerId, slashResult)
    console.log(`[Router] [${messageId}] Slash command /${slashResult.command} handled`)
    return
  }

  // Send to Ollama for AI parsing
  console.log(`[Router] [${messageId}] No slash command — sending to Ollama for parsing`)
  const parsed = await parseMessageWithOllama(text)

  if (!parsed) {
    console.warn(`[Router] [${messageId}] Ollama returned null — could not parse message`)
    await sendTextReply(
      sock,
      remoteJid,
      "Sorry, I couldn't understand that. Try: 'spent 50k lunch' or '/help'"
    )
    return
  }

  console.log(`[Router] [${messageId}] Ollama parsed — intent: ${parsed.intent}, amount: ${parsed.amount}, category: ${parsed.category}, description: "${parsed.description}", period: ${parsed.period}`)

  // Dispatch based on intent
  switch (parsed.intent) {
    case 'log_expense':
    case 'log_income':
      console.log(`[Router] [${messageId}] Dispatching to handleLogTransaction`)
      await handleLogTransaction(
        sock,
        remoteJid,
        msg,
        userId,
        ledgerId,
        messageId,
        text,
        parsed
      )
      break

    case 'query_summary':
      const period = (parsed.period || 'month') as 'today' | 'week' | 'month'
      console.log(`[Router] [${messageId}] Dispatching to handleQuerySummary — period: ${period}`)
      await handleQuerySummary(sock, remoteJid, msg, ledgerId, period)
      break

    case 'set_budget':
      console.log(`[Router] [${messageId}] Dispatching to handleSetBudget — amount: ${parsed.amount}`)
      if (parsed.amount) {
        const { handleSetBudget } = await import('../handlers/budget')
        await handleSetBudget(sock, remoteJid, msg, ledgerId, parsed.amount)
      } else {
        console.warn(`[Router] [${messageId}] set_budget intent but no amount parsed`)
        await sendTextReply(sock, remoteJid, "Please specify a budget amount.")
      }
      break

    case 'set_income':
      console.log(`[Router] [${messageId}] Dispatching to handleSetIncome — amount: ${parsed.amount}`)
      if (parsed.amount) {
        const { handleSetIncome } = await import('../handlers/budget')
        await handleSetIncome(sock, remoteJid, msg, ledgerId, parsed.amount)
      } else {
        console.warn(`[Router] [${messageId}] set_income intent but no amount parsed`)
        await sendTextReply(sock, remoteJid, "Please specify an income amount.")
      }
      break

    case 'unknown':
    default:
      console.warn(`[Router] [${messageId}] Unknown intent: "${parsed.intent}" — sending fallback reply`)
      await sendTextReply(
        sock,
        remoteJid,
        "Sorry, I didn't understand that. Try:\n• spent 50k lunch\n• /summary\n• /help"
      )
      break
  }

  console.log(`[Router] [${messageId}] routeMessage done`)
}

async function handleSlashCommand(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  ledgerId: string,
  result: SlashCommandResult
) {
  const { command, args } = result

  switch (command) {
    case 'help':
      await handleHelp(sock, remoteJid, msg)
      break

    case 'summary':
      let period: 'today' | 'week' | 'month' = 'month'
      if (args.length > 0) {
        const requested = args[0].toLowerCase()
        if (requested === 'today') period = 'today'
        else if (requested === 'week') period = 'week'
        else if (requested === 'month') period = 'month'
      }
      await handleQuerySummary(sock, remoteJid, msg, ledgerId, period)
      break

    case 'budget':
      if (args.length === 0) {
        await sendTextReply(sock, remoteJid, "Usage: /budget <amount>")
        return
      }
      const budgetAmount = parseAmount(args[0])
      if (!budgetAmount) {
        await sendTextReply(sock, remoteJid, "Invalid amount. Use: /budget 2000000")
        return
      }
      await handleSetBudget(sock, remoteJid, msg, ledgerId, budgetAmount)
      break

    case 'income':
      if (args.length === 0) {
        await sendTextReply(sock, remoteJid, "Usage: /income <amount>")
        return
      }
      const incomeAmount = parseAmount(args[0])
      if (!incomeAmount) {
        await sendTextReply(sock, remoteJid, "Invalid amount. Use: /income 5000000")
        return
      }
      await handleSetIncome(sock, remoteJid, msg, ledgerId, incomeAmount)
      break

    default:
      await sendTextReply(sock, remoteJid, "Unknown command. Type /help for all commands.")
      break
  }
}

function parseAmount(text: string): number | null {
  const text_lower = text.toLowerCase().trim()

  // Remove non-digit characters except k, rb, jt, m
  let numStr = text_lower.replace(/[^\d.kmrbjt]/g, '')

  // Parse base number
  const match = numStr.match(/^([\d.]+)([kmrbjt]*)/)
  if (!match) return null

  let num = parseFloat(match[1])
  if (isNaN(num)) return null

  const suffix = match[2].toLowerCase()

  // Convert suffix
  if (suffix.includes('jt')) {
    num *= 1000000
  } else if (suffix.includes('rb')) {
    num *= 1000
  } else if (suffix.includes('m') || suffix.includes('k')) {
    num *= 1000
  }

  return Math.floor(num)
}
