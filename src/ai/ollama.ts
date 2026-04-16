import { Ollama } from 'ollama'
import { env } from '../env'
import { systemPrompt } from './prompts'
import { z } from 'zod'

const ollama = new Ollama({
  host: 'https://api.ollama.com',
  headers: {
    Authorization: `Bearer ${env.OLLAMA_API_KEY}`,
  },
})

const parsedDataSchema = z.object({
  intent: z.enum([
    'log_expense',
    'log_income',
    'query_summary',
    'set_budget',
    'set_income',
    'unknown',
  ]),
  amount: z.number().positive().nullable(),
  category: z
    .enum([
      'food',
      'transport',
      'bills',
      'shopping',
      'entertainment',
      'health',
      'education',
      'income',
      'other',
    ])
    .nullable(),
  description: z.string().nullable(),
  period: z.enum(['today', 'week', 'month', 'all']).nullable(),
})

export type ParsedData = z.infer<typeof parsedDataSchema>

export async function parseMessageWithOllama(text: string): Promise<ParsedData | null> {
  const startTime = Date.now()

  try {
    const response = await ollama.chat({
      model: env.OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      options: { temperature: 0.7 },
    })

    const content = response.message.content
    const responseTime = Date.now() - startTime

    console.log(`[Ollama Cloud] Model: ${env.OLLAMA_MODEL}, Response time: ${responseTime}ms, Status: OK`)
    console.log(`[Ollama Cloud] Raw content: ${content}`)

    const stripped = stripMarkdownFences(content)
    console.log(`[Ollama Cloud] Stripped content: ${stripped}`)

    let parsed: unknown
    try {
      parsed = JSON.parse(stripped)
    } catch (jsonErr) {
      console.error(`[Ollama Cloud] JSON.parse failed: ${jsonErr instanceof Error ? jsonErr.message : jsonErr}`)
      console.error(`[Ollama Cloud] Content that failed to parse: ${stripped}`)
      return null
    }

    let validated: ReturnType<typeof parsedDataSchema.parse>
    try {
      validated = parsedDataSchema.parse(parsed)
    } catch (zodErr) {
      console.error(`[Ollama Cloud] Zod validation failed:`, zodErr)
      console.error(`[Ollama Cloud] Parsed object:`, parsed)
      return null
    }

    console.log(`[Ollama Cloud] Validated result:`, validated)
    return validated
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[Ollama Cloud] Error: ${error.message}`)
    } else {
      console.error('[Ollama Cloud] Unknown error:', error)
    }
    return null
  }
}

function stripMarkdownFences(text: string): string {
  return text.replace(/^```json\s*\n?|\n?```$/g, '').trim()
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

export async function parseDeleteQueryWithOllama(text: string, today: Date): Promise<DeleteQuery | null> {
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

Time expressions:
- "jam HH:MM", "pukul HH:MM", "HH:MM", "at HH:MM" → extract hour and minute
- "jam HH" (no minutes) → hour=HH, minute=0
- 12-hour: "3 sore"=15:00, "7 malam"=19:00, "8 pagi"=8:00

Month names (Indonesian and English):
januari/january/jan=1, februari/february/feb=2, maret/march/mar=3, april/apr=4,
mei/may=5, juni/june/jun=6, juli/july/jul=7, agustus/august/aug=8,
september/sep/sept=9, oktober/october/okt/oct=10, november/nov=11, desember/december/des/dec=12

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
    const response = await ollama.chat({
      model: env.OLLAMA_MODEL,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: text },
      ],
      options: { temperature: 0.1 },
    })

    const content = response.message.content
    const responseTime = Date.now() - startTime
    console.log(`[Ollama DeleteQuery] Response time: ${responseTime}ms`)
    console.log(`[Ollama DeleteQuery] Raw content: ${content}`)

    const stripped = stripMarkdownFences(content)

    let parsed: unknown
    try {
      parsed = JSON.parse(stripped)
    } catch {
      console.error(`[Ollama DeleteQuery] JSON.parse failed on: ${stripped}`)
      return null
    }

    let validated: DeleteQuery
    try {
      validated = deleteQuerySchema.parse(parsed)
    } catch (zodErr) {
      console.error(`[Ollama DeleteQuery] Zod validation failed:`, zodErr)
      return null
    }

    console.log(`[Ollama DeleteQuery] Validated:`, validated)
    return validated
  } catch (error) {
    console.error('[Ollama DeleteQuery] Error:', error instanceof Error ? error.message : error)
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
    await ollama.list()
    return {
      status: 'ok',
      model: env.OLLAMA_MODEL,
      responseTime: Date.now() - startTime,
    }
  } catch (error) {
    console.error('[Ollama Cloud Status Check] Error:', error)
    return {
      status: 'unreachable',
      model: env.OLLAMA_MODEL,
      responseTime: Date.now() - startTime,
    }
  }
}
