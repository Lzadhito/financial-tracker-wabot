import Anthropic from '@anthropic-ai/sdk'
import { env } from '../env'
import { buildNluPrompt } from './prompts'
import type { ParsedIntent, NluIntent, ParsedEntities } from './types'
import { NLU_INTENTS } from './types'

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
})

function stripMarkdownFences(text: string): string {
  return text.replace(/^```json\s*\n?|\n?```$/g, '').trim()
}

function isValidIntent(s: string): s is NluIntent {
  return (NLU_INTENTS as readonly string[]).includes(s)
}

export async function classifyWithHaiku(
  message: string,
  contextString: string
): Promise<ParsedIntent> {
  const { system, userMessage } = buildNluPrompt(message, contextString)

  const fallback: ParsedIntent = {
    intent: 'unclear',
    confidence: 0,
    entities: {},
    clarification: "I didn't quite catch that. You can try something like: `coffee 50k` or `lunch 35000 at Kopi Kenangan`. Or send `menu` to see options.",
    source: 'haiku',
  }

  let lastError: unknown

  // One retry on invalid JSON
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 300,
        system,
        messages: [{ role: 'user', content: userMessage }],
      })

      const content =
        response.content[0].type === 'text' ? response.content[0].text : ''
      const stripped = stripMarkdownFences(content)

      let parsed: unknown
      try {
        parsed = JSON.parse(stripped)
      } catch {
        console.error(
          `[NLU Haiku] Attempt ${attempt + 1}: JSON parse failed — "${stripped}"`
        )
        lastError = new Error('Invalid JSON from Haiku')
        continue
      }

      if (typeof parsed !== 'object' || parsed === null) {
        lastError = new Error('Haiku returned non-object')
        continue
      }

      const obj = parsed as Record<string, unknown>

      const intent: NluIntent = isValidIntent(obj.intent as string)
        ? (obj.intent as NluIntent)
        : 'unclear'

      const confidence =
        typeof obj.confidence === 'number'
          ? Math.max(0, Math.min(1, obj.confidence))
          : 0

      const rawEntities =
        typeof obj.entities === 'object' && obj.entities !== null
          ? (obj.entities as Record<string, unknown>)
          : {}

      const entities: ParsedEntities = {}
      if (typeof rawEntities.amount === 'number') entities.amount = rawEntities.amount
      if (typeof rawEntities.currency === 'string') entities.currency = rawEntities.currency
      if (typeof rawEntities.merchant === 'string') entities.merchant = rawEntities.merchant
      if (typeof rawEntities.category === 'string') entities.category = rawEntities.category
      if (typeof rawEntities.period === 'string') entities.period = rawEntities.period as ParsedEntities['period']
      if (typeof rawEntities.description === 'string') entities.description = rawEntities.description
      if (typeof rawEntities.transactionDate === 'string') entities.transactionDate = rawEntities.transactionDate
      if (Array.isArray(rawEntities.items)) {
        entities.items = rawEntities.items
          .filter(
            (it: unknown) =>
              typeof it === 'object' && it !== null && typeof (it as any).amount === 'number'
          )
          .map((it: any) => ({
            amount: it.amount as number,
            merchant: typeof it.merchant === 'string' ? it.merchant : undefined,
            category: typeof it.category === 'string' ? it.category : undefined,
          }))
      }

      const clarification =
        typeof obj.clarification === 'string' ? obj.clarification : undefined

      console.log('[NLU Haiku] parsed:', JSON.stringify({ intent, confidence, entities }))
      return {
        intent: confidence < 0.6 ? 'unclear' : intent,
        confidence,
        entities,
        clarification: clarification || (intent === 'unclear' || confidence < 0.6 ? fallback.clarification : undefined),
        source: 'haiku',
      }
    } catch (err) {
      console.error(`[NLU Haiku] Attempt ${attempt + 1}: API error —`, err)
      lastError = err
    }
  }

  console.error('[NLU Haiku] Both attempts failed, returning unclear:', lastError)
  return fallback
}
