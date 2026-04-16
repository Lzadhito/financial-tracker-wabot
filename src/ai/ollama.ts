import { env } from '../env'
import { systemPrompt } from './prompts'
import { z } from 'zod'

const OLLAMA_CLOUD_API_BASE = 'https://api.ollama.com/v1'

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
    const response = await fetchWithTimeout(`${OLLAMA_CLOUD_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OLLAMA_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      const errBody = await response.text().catch(() => '(unreadable)')
      console.error(`[Ollama Cloud] API error: ${response.status} ${response.statusText} — body: ${errBody}`)
      return null
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content ?? ''
    const responseTime = Date.now() - startTime

    console.log(`[Ollama Cloud] Model: ${env.OLLAMA_MODEL}, Response time: ${responseTime}ms, Status: OK`)
    console.log(`[Ollama Cloud] Raw content: ${content}`)

    // Strip markdown code fences
    const stripped = stripMarkdownFences(content)
    console.log(`[Ollama Cloud] Stripped content: ${stripped}`)

    // Parse JSON
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
      if (error.name === 'AbortError') {
        console.error('[Ollama Cloud] Request timeout after 15s, retrying once...')
        return await retryOnce(() =>
          parseMessageWithOllama(text)
        )
      }
      console.error(`[Ollama Cloud] Error: ${error.message}`)
    } else {
      console.error('[Ollama Cloud] Unknown error:', error)
    }
    return null
  }
}

async function retryOnce<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (error) {
    console.error('[Ollama Cloud] Retry failed:', error)
    return null
  }
}

function stripMarkdownFences(text: string): string {
  return text.replace(/^```json\s*\n?|\n?```$/g, '').trim()
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = 15000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function checkOllamaStatus(): Promise<{
  status: 'ok' | 'unreachable'
  model: string
  responseTime: number
}> {
  const startTime = Date.now()

  try {
    // Test with a simple models endpoint
    const response = await fetchWithTimeout(`${OLLAMA_CLOUD_API_BASE}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${env.OLLAMA_API_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
    })

    const responseTime = Date.now() - startTime

    if (response.ok) {
      return {
        status: 'ok',
        model: env.OLLAMA_MODEL,
        responseTime: responseTime,
      }
    } else {
      return {
        status: 'unreachable',
        model: env.OLLAMA_MODEL,
        responseTime: responseTime,
      }
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
