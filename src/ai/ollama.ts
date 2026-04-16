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
