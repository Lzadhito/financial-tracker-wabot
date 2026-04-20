import { normalizeAmount } from './indonesianNormalizer'
import type { ParsedIntent, Category, ExpenseItem } from './types'

/**
 * Fast-path regex classifier.
 *
 * Only catches obvious, unambiguous patterns. Returns null when in
 * doubt — caller falls through to Haiku LLM.
 *
 * Target: 60-80 % of typical messages once tuned.
 */

// ── Category keyword maps ───────────────────────────────────────────

const FOOD_KEYWORDS = new Set([
  'makan', 'makan siang', 'makan malam', 'sarapan', 'breakfast', 'lunch',
  'dinner', 'snack', 'jajan', 'kopi', 'coffee', 'teh', 'tea', 'nasi',
  'bakso', 'mie', 'ayam', 'sate', 'warung', 'resto', 'restaurant',
  'pizza', 'burger', 'martabak', 'gorengan', 'roti', 'bread',
])

const TRANSPORT_KEYWORDS = new Set([
  'ojek', 'ojol', 'grab', 'gojek', 'uber', 'taxi', 'taksi', 'bensin',
  'fuel', 'gas', 'parkir', 'parking', 'tol', 'toll', 'bus', 'kereta',
  'train', 'transport', 'transportasi', 'angkot',
])

const BILLS_KEYWORDS = new Set([
  'listrik', 'electricity', 'pulsa', 'internet', 'wifi', 'air',
  'water', 'gas', 'telepon', 'phone', 'sewa', 'rent', 'iuran',
  'tagihan', 'bill', 'bills', 'pln', 'pdam',
])

const SHOPPING_KEYWORDS = new Set([
  'belanja', 'shopping', 'beli', 'buy', 'groceries', 'grocery',
  'supermarket', 'alfamart', 'indomaret', 'tokopedia', 'shopee',
  'lazada', 'blibli',
])

const ENTERTAINMENT_KEYWORDS = new Set([
  'nonton', 'movie', 'film', 'bioskop', 'cinema', 'game', 'gaming',
  'hiburan', 'entertainment', 'spotify', 'netflix', 'youtube',
  'concert', 'konser',
])

const HEALTH_KEYWORDS = new Set([
  'obat', 'medicine', 'dokter', 'doctor', 'rumah sakit', 'hospital',
  'apotek', 'pharmacy', 'kesehatan', 'health', 'gym', 'fitness',
])

const EDUCATION_KEYWORDS = new Set([
  'sekolah', 'school', 'kuliah', 'university', 'kursus', 'course',
  'buku', 'book', 'pendidikan', 'education', 'les', 'tuition',
])

function guessCategory(text: string): Category {
  const lower = text.toLowerCase()
  const words = lower.split(/\s+/)

  for (const w of words) {
    if (FOOD_KEYWORDS.has(w)) return 'food'
    if (TRANSPORT_KEYWORDS.has(w)) return 'transport'
    if (BILLS_KEYWORDS.has(w)) return 'bills'
    if (SHOPPING_KEYWORDS.has(w)) return 'shopping'
    if (ENTERTAINMENT_KEYWORDS.has(w)) return 'entertainment'
    if (HEALTH_KEYWORDS.has(w)) return 'health'
    if (EDUCATION_KEYWORDS.has(w)) return 'education'
  }

  // Two-word checks
  if (lower.includes('makan siang') || lower.includes('makan malam')) return 'food'
  if (lower.includes('rumah sakit')) return 'health'

  return 'other'
}

// ── Amount + label pattern ──────────────────────────────────────────

// Matches: "50rb kopi", "50k coffee", "Rp 50.000 ojek", "25000 lunch"
// Also: "kopi 50rb", "lunch 35000"
const AMOUNT_PREFIX_RE =
  /^((?:rp\.?\s*)?[\d.,]+\s*(?:rb|ribu|k|jt|juta)?)\s+(.+)$/i
const AMOUNT_SUFFIX_RE =
  /^(.+?)\s+((?:rp\.?\s*)?[\d.,]+\s*(?:rb|ribu|k|jt|juta)?)$/i

// Explicit "add"-style: "add 50000 coffee food"
const ADD_EXPLICIT_RE =
  /^(?:add|spent|spend|bayar|beli|bought)\s+((?:rp\.?\s*)?[\d.,]+\s*(?:rb|ribu|k|jt|juta)?)\s+(.+)$/i

// Income patterns
const INCOME_RE =
  /^(?:income|gaji|terima|dapat|received?|masuk|salary|pemasukan)\s+((?:rp\.?\s*)?[\d.,]+\s*(?:rb|ribu|k|jt|juta)?)\s*(.*)$/i
const INCOME_SUFFIX_RE =
  /^((?:rp\.?\s*)?[\d.,]+\s*(?:rb|ribu|k|jt|juta)?)\s+(?:income|gaji|salary|masuk|pemasukan)$/i

// Comma-separated multi-expense: "coffee 50k, lunch 75k, dinner 100k"
const MULTI_EXPENSE_RE = /(.+?)\s+((?:rp\.?\s*)?[\d.,]+\s*(?:rb|ribu|k|jt|juta)?)\s*(?:,|$)/gi

// ── Single-word triggers ────────────────────────────────────────────

const MENU_TRIGGERS = new Set([
  'menu', 'help', 'hi', 'hello', 'halo', 'hai', 'hey', 'hei',
  'start', 'mulai',
])

const REPORT_TRIGGERS = new Set([
  'report', 'summary', 'laporan', 'ringkasan', 'rekap',
])

const UNDO_TRIGGERS = new Set([
  'undo', 'batalkan', 'batalin', 'batal',
])

const DELETE_TRIGGERS = new Set([
  'delete', 'hapus',
])

const SHOW_TRANSACTIONS_TRIGGERS = new Set([
  'show', 'list', 'liat', 'lihat', 'tampilkan', 'tunjukkan',
])

const BUDGET_RE = /^(?:budget|anggaran)(?:\s+set)?\s+((?:rp\.?\s*)?[\d.,]+\s*(?:rb|ribu|k|jt|juta)?)$/i

export function fastPath(text: string): ParsedIntent | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const lower = trimmed.toLowerCase()

  // ── Single-word triggers ────────────────────────────────────────
  if (MENU_TRIGGERS.has(lower)) {
    return {
      intent: 'show_menu',
      confidence: 1.0,
      entities: {},
      source: 'fast_path',
    }
  }

  if (REPORT_TRIGGERS.has(lower)) {
    return {
      intent: 'query_spending',
      confidence: 0.9,
      entities: { period: 'this_month' },
      source: 'fast_path',
    }
  }

  // Check for show_transactions triggers (must come before amount regex)
  const firstWord = lower.split(/\s+/)[0]
  if (SHOW_TRANSACTIONS_TRIGGERS.has(firstWord)) {
    return {
      intent: 'show_transactions',
      confidence: 0.9,
      entities: {},
      source: 'fast_path',
    }
  }

  if (UNDO_TRIGGERS.has(lower)) {
    return {
      intent: 'delete_last',
      confidence: 0.9,
      entities: {},
      source: 'fast_path',
    }
  }

  if (DELETE_TRIGGERS.has(lower)) {
    return {
      intent: 'delete_last',
      confidence: 0.8,
      entities: {},
      source: 'fast_path',
    }
  }

  // ── Budget setting ──────────────────────────────────────────────
  const budgetMatch = trimmed.match(BUDGET_RE)
  if (budgetMatch) {
    const amount = normalizeAmount(budgetMatch[1])
    if (amount !== null && amount > 0) {
      return {
        intent: 'set_budget',
        confidence: 0.95,
        entities: { amount },
        source: 'fast_path',
      }
    }
  }

  // ── Income ──────────────────────────────────────────────────────
  const incomeMatch = trimmed.match(INCOME_RE)
  if (incomeMatch) {
    const amount = normalizeAmount(incomeMatch[1])
    if (amount !== null && amount > 0) {
      return {
        intent: 'add_income',
        confidence: 0.9,
        entities: {
          amount,
          description: incomeMatch[2]?.trim() || undefined,
          category: 'other',
        },
        source: 'fast_path',
      }
    }
  }

  const incomeSuffix = trimmed.match(INCOME_SUFFIX_RE)
  if (incomeSuffix) {
    const amount = normalizeAmount(incomeSuffix[1])
    if (amount !== null && amount > 0) {
      return {
        intent: 'add_income',
        confidence: 0.9,
        entities: { amount, category: 'other' },
        source: 'fast_path',
      }
    }
  }

  // ── Explicit add/spent ──────────────────────────────────────────
  const addMatch = trimmed.match(ADD_EXPLICIT_RE)
  if (addMatch) {
    const amount = normalizeAmount(addMatch[1])
    if (amount !== null && amount > 0) {
      const desc = addMatch[2].trim()
      return {
        intent: 'add_expense',
        confidence: 0.95,
        entities: {
          amount,
          description: desc,
          category: guessCategory(desc),
        },
        source: 'fast_path',
      }
    }
  }

  // ── Multi-expense (comma-separated) ────────────────────────────
  if (trimmed.includes(',')) {
    const items: ExpenseItem[] = []
    let match
    const regex = /(.+?)\s+((?:rp\.?\s*)?[\d.,]+\s*(?:rb|ribu|k|jt|juta)?)\s*(?:,|$)/gi

    while ((match = regex.exec(trimmed)) !== null) {
      const desc = match[1].trim()
      const amount = normalizeAmount(match[2])
      if (amount !== null && amount > 0 && desc) {
        items.push({
          amount,
          merchant: desc,
          category: guessCategory(desc),
        })
      }
    }

    if (items.length > 1) {
      return {
        intent: 'add_expense',
        confidence: 0.9,
        entities: { items },
        source: 'fast_path',
      }
    }
  }

  // ── Amount + label (amount first) ───────────────────────────────
  const prefixMatch = trimmed.match(AMOUNT_PREFIX_RE)
  if (prefixMatch) {
    const amount = normalizeAmount(prefixMatch[1])
    if (amount !== null && amount > 0) {
      const desc = prefixMatch[2].trim()
      // Avoid matching bare numbers followed by query words
      if (/^(berapa|how|what|total|apa|kapan|when|where|why)$/i.test(desc)) {
        return null // ambiguous — let Haiku handle
      }
      return {
        intent: 'add_expense',
        confidence: 0.85,
        entities: {
          amount,
          description: desc,
          category: guessCategory(desc),
        },
        source: 'fast_path',
      }
    }
  }

  // ── Amount + label (label first) ────────────────────────────────
  const suffixMatch = trimmed.match(AMOUNT_SUFFIX_RE)
  if (suffixMatch) {
    const amountStr = suffixMatch[2]
    const amount = normalizeAmount(amountStr)
    if (amount !== null && amount > 0) {
      const desc = suffixMatch[1].trim()
      // Skip if the "label" is a trigger word
      if (MENU_TRIGGERS.has(desc.toLowerCase()) || REPORT_TRIGGERS.has(desc.toLowerCase())) {
        return null
      }
      return {
        intent: 'add_expense',
        confidence: 0.85,
        entities: {
          amount,
          description: desc,
          category: guessCategory(desc),
        },
        source: 'fast_path',
      }
    }
  }

  // ── Nothing matched — fall through to Haiku ─────────────────────
  return null
}
