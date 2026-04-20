import Anthropic from '@anthropic-ai/sdk'
import { env } from '../env'
import { z } from 'zod'

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
})

function stripMarkdownFences(text: string): string {
  return text.replace(/^```json\s*\n?|\n?```$/g, '').trim()
}

const memberMatchSchema = z.object({
  index: z.number().int().nullable(),
})

/**
 * Uses AI to fuzzy-match a query name against a list of ledger members.
 * Returns the userId of the best match, or null if no good match was found.
 */
export async function matchMemberNameWithOllama(
  query: string,
  members: { userId: string; displayName: string }[]
): Promise<string | null> {
  if (members.length === 0) return null

  // Fast path: exact or normalized match — no AI needed
  const normalizedQuery = query.trim().toLowerCase()
  const exactMatch = members.find(
    (m) => m.displayName.trim().toLowerCase() === normalizedQuery
  )
  if (exactMatch) return exactMatch.userId

  // AI path for partial/fuzzy matching
  const numberedList = members
    .map((m, i) => `${i}: ${m.displayName}`)
    .join('\n')

  const systemMsg = `You are a name matcher. Given a query and a numbered list of member names, return the 0-based index of the best matching name.
The query may be a partial name, nickname, or typo. Match as best you can.
If there is no reasonable match, return null.

Member list:
${numberedList}

Return ONLY a JSON object with field "index": an integer (0-based index) or null.
Example: {"index":2} or {"index":null}
Respond with ONLY the JSON. No markdown, no explanation.`

  try {
    const response = await anthropic.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 256,
      system: systemMsg,
      messages: [{ role: 'user', content: query }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const stripped = stripMarkdownFences(text)
    console.log(`[Haiku MemberMatch] Query: "${query}", Members: [${members.map((m) => m.displayName).join(', ')}], Response: ${stripped}`)
    const parsed = JSON.parse(stripped)
    const validated = memberMatchSchema.parse(parsed)

    if (validated.index === null || validated.index < 0 || validated.index >= members.length) return null

    return members[validated.index].userId
  } catch (error) {
    console.error('[Haiku MemberMatch] Error:', error instanceof Error ? error.message : error)
    return null
  }
}

const deleteQuerySchema = z.object({
  description: z.string(),
  day: z.number().int().min(1).max(31).nullable(),
  month: z.number().int().min(1).max(12).nullable(),
  year: z.number().int().nullable(),
  hour: z.number().int().min(0).max(23).nullable(),
  minute: z.number().int().min(0).max(59).nullable(),
})

export type DeleteQuery = z.infer<typeof deleteQuerySchema>

export async function parseDeleteQueryWithOllama(rawText: string, today: Date): Promise<DeleteQuery | null> {
  // Normalize dot-separated times (e.g. "21.36") to colon format ("21:36")
  // Only match HH.MM patterns that look like times (hour 0-23, minute 0-59)
  const text = rawText.replace(/\b([01]?\d|2[0-3])\.([0-5]\d)\b/g, '$1:$2')

  const todayDay = today.getDate()
  const todayMonth = today.getMonth() + 1
  const todayYear = today.getFullYear()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const yesterdayDay = yesterday.getDate()
  const yesterdayMonth = yesterday.getMonth() + 1
  const startTime = Date.now()

  const systemMsg = `You are a date/description extractor for a financial transaction delete command.
Today is ${todayDay}/${todayMonth}/${todayYear} (day/month/year).

The user provides a natural language string with a transaction name and a date (and optionally a time).
The language may be Bahasa Indonesia, English, or mixed — handle both freely.

Relative date words to resolve using today's date:
- "hari ini", "today", "sekarang", "tadi" → day=${todayDay}, month=${todayMonth}, year=${todayYear}
- "kemarin", "yesterday", "tadi malam" (if before midnight) → day=${yesterdayDay}, month=${yesterdayMonth}
- "tadi pagi", "tadi siang", "tadi sore", "tadi malam" → same as today unless clearly yesterday

Time expressions (accept both colon and dot as separator):
- "jam HH:MM", "pukul HH:MM", "HH:MM", "HH.MM", "at HH:MM" → extract hour and minute
- "jam HH" (no minutes) → hour=HH, minute=0
- 12-hour: "3 sore"=15:00, "7 malam"=19:00, "8 pagi"=8:00

Month names — accept full names, short names, Indonesian and English, any capitalisation:
januari/january/jan=1, februari/february/feb=2, maret/march/mar=3,
april/apr=4, mei/may=5, juni/june/jun=6, juli/july/jul=7,
agustus/august/aug=8, september/sep/sept=9, oktober/october/okt/oct=10,
november/nov=11, desember/december/des/dec=12

Return ONLY a JSON object with these fields:
- description: the transaction name/description (string, clean, no date/time parts)
- day: day of month as integer (1–31), or null if no date is mentioned
- month: month as integer (1–12), or null if no date is mentioned
- year: year as integer, or null if not specified or relative
- hour: hour in 24h format as integer (0–23), or null if not specified
- minute: minute as integer (0–59), or null if not specified

IMPORTANT: If the user provides only a transaction name with no date or time at all, set day, month, year, hour, minute all to null.

Examples (assuming today is ${todayDay}/${todayMonth}/${todayYear}):
Input: "beli kopi hari ini jam 19:43"
Output: {"description":"beli kopi","day":${todayDay},"month":${todayMonth},"year":null,"hour":19,"minute":43}

Input: "makan siang kemarin"
Output: {"description":"makan siang","day":${yesterdayDay},"month":${yesterdayMonth},"year":null,"hour":null,"minute":null}

Input: "beli kopi 16 april 15:03"
Output: {"description":"beli kopi","day":16,"month":4,"year":null,"hour":15,"minute":3}

Input: "kopi (16 April 21.36)"
Output: {"description":"kopi","day":16,"month":4,"year":null,"hour":21,"minute":36}

Input: "kopi (16 Apr, 21.36)"
Output: {"description":"kopi","day":16,"month":4,"year":null,"hour":21,"minute":36}

Input: "makan siang 16 April"
Output: {"description":"makan siang","day":16,"month":4,"year":null,"hour":null,"minute":null}

Input: "makan siang 16 april"
Output: {"description":"makan siang","day":16,"month":4,"year":null,"hour":null,"minute":null}

Input: "groceries 5 january 2026 09:30"
Output: {"description":"groceries","day":5,"month":1,"year":2026,"hour":9,"minute":30}

Input: "bensin tadi pukul 08:00"
Output: {"description":"bensin","day":${todayDay},"month":${todayMonth},"year":null,"hour":8,"minute":0}

Input: "beli kopi"
Output: {"description":"beli kopi","day":null,"month":null,"year":null,"hour":null,"minute":null}

Respond with ONLY the JSON object. No markdown, no explanations.`

  try {
    const response = await anthropic.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 512,
      system: systemMsg,
      messages: [{ role: 'user', content: text }],
    })

    const content = response.content[0].type === 'text' ? response.content[0].text : ''
    const responseTime = Date.now() - startTime
    console.log(`[Haiku DeleteQuery] Response time: ${responseTime}ms`)
    console.log(`[Haiku DeleteQuery] Raw content: ${content}`)

    const stripped = stripMarkdownFences(content)

    let parsed: unknown
    try {
      parsed = JSON.parse(stripped)
    } catch {
      console.error(`[Haiku DeleteQuery] JSON.parse failed on: ${stripped}`)
      return null
    }

    let validated: DeleteQuery
    try {
      validated = deleteQuerySchema.parse(parsed)
    } catch (zodErr) {
      console.error(`[Haiku DeleteQuery] Zod validation failed:`, zodErr)
      return null
    }

    console.log(`[Haiku DeleteQuery] Validated:`, validated)
    return validated
  } catch (error) {
    console.error('[Haiku DeleteQuery] Error:', error instanceof Error ? error.message : error)
    return null
  }
}

export async function checkOllamaStatus(): Promise<{
  status: 'ok' | 'unreachable'
  model: string
  responseTime: number
}> {
  const startTime = Date.now()

  try {
    await anthropic.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    })
    return {
      status: 'ok',
      model: env.ANTHROPIC_MODEL,
      responseTime: Date.now() - startTime,
    }
  } catch (error) {
    console.error('[Haiku Status Check] Error:', error)
    return {
      status: 'unreachable',
      model: env.ANTHROPIC_MODEL,
      responseTime: Date.now() - startTime,
    }
  }
}
