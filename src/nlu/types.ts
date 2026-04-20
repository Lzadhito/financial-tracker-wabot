// OWNERSHIP MODEL: one WhatsApp group = one ledger, keyed by group JID.
// Entries tagged with logged_by (sender JID) for by-member reporting.
// Any group member can edit/undo any entry. No per-entry privacy.
// Deliberate product decision — do not extend without owner approval.

export const NLU_INTENTS = [
  'add_expense',
  'add_income',
  'query_spending',
  'query_balance',
  'edit_last',
  'delete_last',
  'set_budget',
  'show_menu',
  'show_transactions',
  'export_report',
  'small_talk',
  'unclear',
] as const

export type NluIntent = (typeof NLU_INTENTS)[number]

export const ALLOWED_CATEGORIES = [
  'food',
  'transport',
  'bills',
  'shopping',
  'entertainment',
  'health',
  'education',
  'other',
] as const

export type Category = (typeof ALLOWED_CATEGORIES)[number]

export type Period =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'

export interface ExpenseItem {
  amount: number
  merchant?: string
  category?: string
}

export interface ParsedEntities {
  amount?: number
  currency?: string
  merchant?: string
  category?: string
  period?: Period
  description?: string
  items?: ExpenseItem[]
}

export interface ParsedIntent {
  intent: NluIntent
  confidence: number
  entities: ParsedEntities
  clarification?: string
  source: 'fast_path' | 'haiku'
}

export interface BotResponse {
  text: string
  buttons?: { id: string; label: string }[]
  listMessage?: {
    title: string
    sections: Array<{
      title: string
      rows: Array<{ id: string; title: string; description?: string }>
    }>
  }
  pendingConfirmation?: {
    intent: string
    entities: ParsedEntities
    ttl: number
  }
}
