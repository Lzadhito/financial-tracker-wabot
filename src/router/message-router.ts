import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { matchMemberNameWithOllama } from '../ai/haiku'
import { handleHelp } from '../handlers/help'
import { handleQuerySummary } from '../handlers/summary'
import { handleSetBudget, handleSetIncome } from '../handlers/budget'
import { handleIncomeReport } from '../handlers/income-report'
import { handleTransactionsList } from '../handlers/transactions-list'
import { handleDeleteTransaction } from '../handlers/delete-transaction'
import { sendTextReply } from '../whatsapp/sender'
import { parseDateFilter, looksLikeDateArg } from '../utils/date-filter'
import { getMembersWithDisplayNames } from '../services/ledger.service'
import { getUserByPhoneNumber } from '../services/user.service'
import { classify } from '../nlu/index'
import { sendBotResponse } from '../response/builder'
import { addUserTurn, addBotTurn, setLastAction } from '../session/store'
import { handleButtonPress } from '../nlu/handlers/buttonPress'
import { handleAddExpense } from '../nlu/handlers/addExpense'
import { handleAddIncome } from '../nlu/handlers/addIncome'
import { handleQuerySpending } from '../nlu/handlers/querySpending'
import { handleQueryBalance } from '../nlu/handlers/queryBalance'
import { handleSetBudget as nluHandleSetBudget } from '../nlu/handlers/setBudget'
import { handleShowMenu } from '../nlu/handlers/showMenu'
import { handleSmallTalk } from '../nlu/handlers/smallTalk'
import { handleUnclear } from '../nlu/handlers/unclear'
import { handleDeleteLastWithLedger } from '../nlu/handlers/deleteLast'
import { handleEditLast } from '../nlu/handlers/editLast'
import { handleExportReport } from '../nlu/handlers/exportReport'
import { handleShowTransactions } from '../nlu/handlers/showTransactions'
import { findTransactionByMessageId } from '../services/transaction.service'
import type { BotResponse } from '../nlu/types'


export interface SlashCommandResult {
  type: 'slash_command'
  command: string
  args: string[]
}

export function tryParseSlashCommand(text: string): SlashCommandResult | null {
  if (!text.startsWith('/')) {
    return null
  }

  const parts = text.trim().split(/\s+/)
  const command = parts[0].slice(1).toLowerCase()
  const args = parts.slice(1)

  return { type: 'slash_command', command, args }
}

/**
 * NLU-powered message routing.
 *
 * Flow:
 *   1. Slash commands → handleSlashCommand
 *   2. Natural language → classify() → intent handler → BotResponse → send
 */
export async function routeNluMessage(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  userId: string,
  ledgerId: string,
  messageId: string,
  text: string,
  senderJid: string,
  pushName: string | undefined,
  mentionedUserPhones: string[] = []
): Promise<void> {
  console.log(`[NLU Router] [${messageId}] routeNluMessage — text: "${text}"`)

  // Slash commands
  if (text.startsWith('/')) {
    console.log(`[NLU Router] [${messageId}] Slash command — delegating to handleSlashCommand`)
    const slashResult = tryParseSlashCommand(text)
    if (slashResult) {
      await handleSlashCommand(sock, remoteJid, msg, ledgerId, slashResult, mentionedUserPhones)
    }
    return
  }

  // Record user turn in session
  addUserTurn(remoteJid, senderJid, text)

  const loggerName = pushName || senderJid.split('@')[0]

  // Handle undo (special case: "undo" keyword within 5-min window)
  if (text.toLowerCase() === 'undo') {
    console.log(`[NLU Router] [${messageId}] Undo keyword detected`)
    await handleButtonPress('undo', remoteJid, senderJid, loggerName, userId, ledgerId, sock, remoteJid, msg)
    return
  }

  // Classify
  const parsed = await classify(text, senderJid, remoteJid)
  console.log(`[NLU Router] [${messageId}] Classified — intent: ${parsed.intent}, confidence: ${parsed.confidence}, source: ${parsed.source}`)

  // Dedup check for add intents
  if (parsed.intent === 'add_expense' || parsed.intent === 'add_income') {
    const existing = await findTransactionByMessageId(messageId)
    if (existing) {
      console.log(`[NLU Router] [${messageId}] Dedup — transaction already recorded`)
      return
    }
  }

  // Dispatch to intent handler
  let response: BotResponse

  switch (parsed.intent) {
    case 'add_expense':
      response = await handleAddExpense(parsed, userId, ledgerId, messageId, text, loggerName, senderJid, remoteJid)
      break

    case 'add_income':
      response = await handleAddIncome(parsed, userId, ledgerId, messageId, text, loggerName, senderJid, remoteJid)
      break

    case 'query_spending':
      response = await handleQuerySpending(parsed, ledgerId)
      break

    case 'query_balance':
      response = await handleQueryBalance(parsed, ledgerId)
      break

    case 'edit_last':
      response = await handleEditLast()
      break

    case 'delete_last':
      response = await handleDeleteLastWithLedger(remoteJid, ledgerId)
      break

    case 'set_budget':
      response = await nluHandleSetBudget(parsed, ledgerId, loggerName, senderJid, remoteJid, userId)
      break

    case 'show_menu':
      response = await handleShowMenu()
      break

    case 'show_transactions':
      response = await handleShowTransactions(ledgerId)
      break

    case 'export_report':
      response = await handleExportReport()
      break

    case 'small_talk':
      response = await handleSmallTalk()
      break

    case 'unclear':
    default:
      response = await handleUnclear(parsed)
      break
  }

  // Record bot turn
  addBotTurn(remoteJid, parsed.intent, parsed.entities)

  // Send response
  await sendBotResponse(sock, remoteJid, response, msg)

  console.log(`[NLU Router] [${messageId}] Done`)
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
      if (filteredUserId === false) return
      await handleQuerySummary(sock, remoteJid, msg, ledgerId, parseDateFilter(dateArgs), groupByUser, filteredUserId)
      break
    }

    case 'transactions': {
      const groupByUser = args.some((a) => a.toLowerCase() === 'user')
      const nonUser = args.filter((a) => a.toLowerCase() !== 'user')
      const { nameArgs, dateArgs } = splitNameAndDateArgs(nonUser)
      const filteredUserId = await resolveUserFilter(sock, remoteJid, msg, ledgerId, mentionedUserPhones, nameArgs)
      if (filteredUserId === false) return
      await handleTransactionsList(sock, remoteJid, msg, ledgerId, parseDateFilter(dateArgs), groupByUser, filteredUserId)
      break
    }

    case 'income': {
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

function isAmountArg(text: string): boolean {
  return /^[\d.,]+([kmrbjt]*)$/i.test(text.trim())
}

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

async function resolveUserFilter(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  ledgerId: string,
  mentionedUserPhones: string[],
  nameArgs: string[]
): Promise<string | null | false> {
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
