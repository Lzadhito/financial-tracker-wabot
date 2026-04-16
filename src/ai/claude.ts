import Anthropic from '@anthropic-ai/sdk'
import { env } from '../env'
import { systemPrompt } from './prompts'
import { z } from 'zod'

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

const MODEL = 'claude-haiku-4-5'

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

export async function parseMessageWithClaude(text: string): Promise<ParsedData | null> {
  const startTime = Date.now()

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    })

    const responseTime = Date.now() - startTime
    const content = response.content[0]?.type === 'text' ? response.content[0].text : ''

    console.log(`[Claude] Model: ${MODEL}, Response time: ${responseTime}ms, Status: OK`)
    console.log(`[Claude] Raw content: ${content}`)

    const stripped = stripMarkdownFences(content)
    console.log(`[Claude] Stripped content: ${stripped}`)

    let parsed: unknown
    try {
      parsed = JSON.parse(stripped)
    } catch (jsonErr) {
      console.error(`[Claude] JSON.parse failed: ${jsonErr instanceof Error ? jsonErr.message : jsonErr}`)
      console.error(`[Claude] Content that failed to parse: ${stripped}`)
      return null
    }

    let validated: ReturnType<typeof parsedDataSchema.parse>
    try {
      validated = parsedDataSchema.parse(parsed)
    } catch (zodErr) {
      console.error(`[Claude] Zod validation failed:`, zodErr)
      console.error(`[Claude] Parsed object:`, parsed)
      return null
    }

    console.log(`[Claude] Validated result:`, validated)
    return validated
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`[Claude] API error ${error.status}: ${error.message}`)
    } else if (error instanceof Error) {
      console.error(`[Claude] Error: ${error.message}`)
    } else {
      console.error('[Claude] Unknown error:', error)
    }
    return null
  }
}

function stripMarkdownFences(text: string): string {
  return text.replace(/^```json\s*\n?|\n?```$/g, '').trim()
}

export async function checkClaudeStatus(): Promise<{
  status: 'ok' | 'unreachable'
  model: string
  responseTime: number
}> {
  const startTime = Date.now()

  try {
    await client.models.retrieve(MODEL)
    return {
      status: 'ok',
      model: MODEL,
      responseTime: Date.now() - startTime,
    }
  } catch (error) {
    console.error('[Claude Status Check] Error:', error)
    return {
      status: 'unreachable',
      model: MODEL,
      responseTime: Date.now() - startTime,
    }
  }
}
