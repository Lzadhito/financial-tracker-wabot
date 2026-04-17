import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { parseMessageWithOllama, matchMemberNameWithOllama, type ParsedData } from '../ai/ollama'
import { handleHelp } from '../handlers/help'
import { handleQuerySummary } from '../handlers/summary'
import { handleSetBudget, handleSetIncome } from '../handlers/budget'
import { handleLogTransaction } from '../handlers/transaction'
import { handleIncomeReport } from '../handlers/income-report'
import { handleTransactionsList } from '../handlers/transactions-list'
import { handleDeleteTransaction } from '../handlers/delete-transaction'
import { sendTextReply } from '../whatsapp/sender'
import { parseDateFilter, looksLikeDateArg } from '../utils/date-filter'
import { getMembersWithDisplayNames } from '../services/ledger.service'
import { getUserByPhoneNumber } from '../services/user.service'

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
  phoneNumber: string,
  mentionedUserPhones: string[] = []
): Promise<void> {
  console.log(`[Router] [${messageId}] routeMessage called — text: "${text}", userId: ${userId}, ledgerId: ${ledgerId}`)

  // Try slash command first
  const slashResult = tryParseSlashCommand(text)

  if (slashResult) {
    console.log(`[Router] [${messageId}] Slash command detected — command: /${slashResult.command}, args: [${slashResult.args.join(', ')}]`)
    await handleSlashCommand(sock, remoteJid, msg, ledgerId, slashResult, mentionedUserPhones)
    console.log(`[Router] [${messageId}] Slash command /${slashResult.command} handled`)
    return
  }

  // Send to AI for parsing
  console.log(`[Router] [${messageId}] No slash command — sending to AI for parsing`)
  const parsed = await parseMessageWithOllama(text)

  if (!parsed) {
    console.warn(`[Router] [${messageId}] AI returned null — could not parse message`)
    await sendTextReply(
      sock,
      remoteJid,
      "Sorry, I couldn't understand that. Try: 'spent 50k lunch' or '/help'"
    )
    return
  }

  console.log(`[Router] [${messageId}] AI parsed — intent: ${parsed.intent}, amount: ${parsed.amount}, category: ${parsed.category}, description: "${parsed.description}", period: ${parsed.period}`)

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

    case 'query_summary': {
      const period = (parsed.period || 'month') as 'today' | 'week' | 'month'
      const filter = { type: 'period' as const, period }
      console.log(`[Router] [${messageId}] Dispatching to handleQuerySummary — period: ${period}`)
      await handleQuerySummary(sock, remoteJid, msg, ledgerId, filter)
      break
    }

    case 'set_budget':
      console.log(`[Router] [${messageId}] Dispatching to handleSetBudget — amount: ${parsed.amount}`)
      if (parsed.amount) {
        await handleSetBudget(sock, remoteJid, msg, ledgerId, parsed.amount)
      } else {
        console.warn(`[Router] [${messageId}] set_budget intent but no amount parsed`)
        await sendTextReply(sock, remoteJid, "Please specify a budget amount.")
      }
      break

    case 'set_income':
      console.log(`[Router] [${messageId}] Dispatching to handleSetIncome — amount: ${parsed.amount}`)
      if (parsed.amount) {
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
  result: SlashCommandResult,
  mentionedUserPhones: string[] = []
) {
  const { command, args } = result

  switch (command) {
    case 'help':
      await handleHelp(sock, remoteJid, msg)
      break

    case 'summary': {
      const groupByUser = args.some((a) => a.toLowerCase() === 'user')
      const nonUser = args.filter((a) => a.toLowerCase() !== 'user')
      const { nameArgs, dateArgs } = splitNameAndDateArgs(nonUser)
      const filteredUserId = await resolveUserFilter(sock, remoteJid, msg, ledgerId, mentionedUserPhones, nameArgs)
      if (filteredUserId === false) return // error already sent
      await handleQuerySummary(sock, remoteJid, msg, ledgerId, parseDateFilter(dateArgs), groupByUser, filteredUserId)
      break
    }

    case 'transactions': {
      const groupByUser = args.some((a) => a.toLowerCase() === 'user')
      const nonUser = args.filter((a) => a.toLowerCase() !== 'user')
      const { nameArgs, dateArgs } = splitNameAndDateArgs(nonUser)
      const filteredUserId = await resolveUserFilter(sock, remoteJid, msg, ledgerId, mentionedUserPhones, nameArgs)
      if (filteredUserId === false) return // error already sent
      await handleTransactionsList(sock, remoteJid, msg, ledgerId, parseDateFilter(dateArgs), groupByUser, filteredUserId)
      break
    }

    case 'income': {
      // If first arg looks like an amount (digits / k / M suffix) → set monthly income
      // Otherwise → show income report
      if (args.length > 0 && isAmountArg(args[0])) {
        const amount = parseAmount(args[0])
        if (!amount) {
          await sendTextReply(sock, remoteJid, "Invalid amount. Use: /income 5000000 or /income 5jt")
          return
        }
        await handleSetIncome(sock, remoteJid, msg, ledgerId, amount)
      } else {
        await handleIncomeReport(sock, remoteJid, msg, ledgerId, parseDateFilter(args))
      }
      break
    }

    case 'set-income':
    case 'setincome': {
      if (args.length === 0) {
        await sendTextReply(sock, remoteJid, "Usage: /set-income <amount>")
        return
      }
      const amount = parseAmount(args[0])
      if (!amount) {
        await sendTextReply(sock, remoteJid, "Invalid amount. Use: /set-income 5000000")
        return
      }
      await handleSetIncome(sock, remoteJid, msg, ledgerId, amount)
      break
    }

    case 'budget': {
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
    }

    case 'delete':
      await handleDeleteTransaction(sock, remoteJid, msg, ledgerId, args)
      break

    default:
      await sendTextReply(sock, remoteJid, "Unknown command. Type /help for all commands.")
      break
  }
}

/** Returns true if the string looks like a raw amount (not a date). */
function isAmountArg(text: string): boolean {
  return /^[\d.,]+([kmrbjt]*)$/i.test(text.trim())
}

/**
 * Splits args into name tokens and date tokens.
 * Anything that looks like a date stays in dateArgs; the rest is a name query.
 */
function splitNameAndDateArgs(args: string[]): { nameArgs: string[]; dateArgs: string[] } {
  const nameArgs: string[] = []
  const dateArgs: string[] = []
  for (const arg of args) {
    if (looksLikeDateArg(arg)) {
      dateArgs.push(arg)
    } else {
      nameArgs.push(arg)
    }
  }
  return { nameArgs, dateArgs }
}

function parseAmount(text: string): number | null {
  const text_lower = text.toLowerCase().trim()

  let numStr = text_lower.replace(/[^\d.kmrbjt]/g, '')

  const match = numStr.match(/^([\d.]+)([kmrbjt]*)/)
  if (!match) return null

  let num = parseFloat(match[1])
  if (isNaN(num)) return null

  const suffix = match[2].toLowerCase()

  if (suffix.includes('jt')) {
    num *= 1000000
  } else if (suffix.includes('rb')) {
    num *= 1000
  } else if (suffix.includes('m') || suffix.includes('k')) {
    num *= 1000
  }

  return Math.floor(num)
}

/**
 * Resolves a user filter for /transactions and /summary commands.
 *
 * Priority:
 *   1. @mention in message → look up by phone number directly (exact, no AI)
 *   2. Plain-text name args → AI fuzzy match against ledger members
 *   3. Neither → null (no filter)
 *
 * Returns:
 *   - string userId → use as filter
 *   - null          → no filter (show all)
 *   - false         → error already sent, caller should return
 */
async function resolveUserFilter(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  ledgerId: string,
  mentionedUserPhones: string[],
  nameArgs: string[]
): Promise<string | null | false> {
  // 1. @mention takes priority — look up user by phone directly
  if (mentionedUserPhones.length > 0) {
    const phone = mentionedUserPhones[0]
    const user = await getUserByPhoneNumber(phone)
    if (!user) {
      await sendTextReply(sock, remoteJid, `No registered user found for the mentioned contact.`, msg)
      return false
    }
    console.log(`[Router] User filter via @mention: phone=${phone}, userId=${user.id}`)
    return user.id
  }

  // 2. Plain-text name → AI fuzzy match
  if (nameArgs.length > 0) {
    const nameFilter = nameArgs.join(' ')
    const members = await getMembersWithDisplayNames(ledgerId)
    const userId = await matchMemberNameWithOllama(nameFilter, members)
    if (!userId) {
      await sendTextReply(sock, remoteJid, `No member found matching "${nameFilter}".`, msg)
      return false
    }
    console.log(`[Router] User filter via AI name match: query="${nameFilter}", userId=${userId}`)
    return userId
  }

  return null
}
