/**
 * Indonesian number normalizer.
 *
 * Converts Indonesian shorthand, "Rp" prefixed amounts, and mixed
 * dot/comma separators into plain IDR integers.
 */

/**
 * normalizeAmount parses a raw Indonesian-style amount string into
 * an integer IDR value, or returns null if unparseable.
 *
 * Handles:
 *  - 50rb / 50 rb / 50 ribu → 50000
 *  - 50k / 50K → 50000
 *  - 1jt / 1 juta → 1000000
 *  - 1,5jt / 1.5jt → 1500000
 *  - Rp 50.000 / Rp50000 / 50,000 → 50000
 *  - 1.500.000 → 1500000
 *  - 50.5rb → 50500
 */
export function normalizeAmount(raw: string): number | null {
  let s = raw.trim()

  // Strip "Rp" / "Rp." prefix (case-insensitive)
  s = s.replace(/^rp\.?\s*/i, '')

  // Strip any remaining whitespace between parts
  // but preserve spaces before suffixes like "50 rb"
  s = s.trim()
  if (!s) return null

  // Check for suffix (rb/ribu/k/jt/juta) at end (possibly after a space)
  const suffixMatch = s.match(/^([\d.,\s]+?)\s*(rb|ribu|k|jt|juta)$/i)

  if (suffixMatch) {
    const numPart = suffixMatch[1].replace(/\s/g, '')
    const suffix = suffixMatch[2].toLowerCase()

    const num = parseDecimalNumber(numPart)
    if (num === null) return null

    const multiplier = suffixToMultiplier(suffix)
    return Math.round(num * multiplier)
  }

  // No suffix — try to parse as a plain number with dot/comma separators
  const cleaned = s.replace(/\s/g, '')
  const result = parseFormattedNumber(cleaned)
  if (result !== null) return Math.round(result)

  return null
}

function suffixToMultiplier(suffix: string): number {
  switch (suffix) {
    case 'rb':
    case 'ribu':
    case 'k':
      return 1000
    case 'jt':
    case 'juta':
      return 1000000
    default:
      return 1
  }
}

/**
 * Parses a number that may use dot or comma as decimal separator.
 * Used when a suffix is present (e.g., "1.5" in "1.5jt", "50,5" in "50,5rb").
 */
function parseDecimalNumber(s: string): number | null {
  if (!s) return null

  // Remove any thousands separators if the pattern looks like "1.500" or "1,500"
  // But "1.5" or "1,5" should be treated as decimal
  // Heuristic: if the part after the last separator has exactly 3 digits,
  // treat all separators as thousands separators

  // Only dots
  if (/^\d+(\.\d+)*$/.test(s)) {
    const parts = s.split('.')
    if (parts.length === 1) return parseFloat(s)
    const lastPart = parts[parts.length - 1]
    if (lastPart.length === 3 && parts.length > 1) {
      // Thousands separator: 1.500 → 1500
      return parseInt(parts.join(''), 10)
    }
    // Decimal: 1.5 → 1.5
    return parseFloat(s)
  }

  // Only commas
  if (/^\d+(,\d+)*$/.test(s)) {
    const parts = s.split(',')
    if (parts.length === 1) return parseFloat(s)
    const lastPart = parts[parts.length - 1]
    if (lastPart.length === 3 && parts.length > 1) {
      // Thousands separator: 1,500 → 1500
      return parseInt(parts.join(''), 10)
    }
    // Decimal: 1,5 → 1.5
    return parseFloat(s.replace(',', '.'))
  }

  // Mixed or plain digits
  const plain = parseFloat(s)
  if (!isNaN(plain)) return plain

  return null
}

/**
 * Parses a formatted number with dot/comma thousands/decimal separators.
 * No suffix. Handles:
 *  - 50000 → 50000
 *  - 50.000 → 50000  (dot as thousands)
 *  - 1.500.000 → 1500000
 *  - 50,000 → 50000  (comma as thousands)
 *  - Rp 1,500,000 → 1500000
 */
function parseFormattedNumber(s: string): number | null {
  if (!s) return null

  // Pure digits
  if (/^\d+$/.test(s)) {
    return parseInt(s, 10)
  }

  // Multiple dots as thousands: 1.500.000
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return parseInt(s.replace(/\./g, ''), 10)
  }

  // Multiple commas as thousands: 1,500,000
  if (/^\d{1,3}(,\d{3})+$/.test(s)) {
    return parseInt(s.replace(/,/g, ''), 10)
  }

  // Dot-separated with decimal comma at end: 1.500,50 (European style — rare in ID)
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'))
  }

  // Comma-separated with decimal dot at end: 1,500.50
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) {
    return parseFloat(s.replace(/,/g, ''))
  }

  // Single dot — use heuristic
  const dotMatch = s.match(/^(\d+)\.(\d+)$/)
  if (dotMatch) {
    const afterDot = dotMatch[2]
    if (afterDot.length === 3) {
      // 50.000 → 50000 (thousands)
      return parseInt(s.replace('.', ''), 10)
    }
    // 50.5 → 50.5 (decimal)
    return parseFloat(s)
  }

  // Single comma — use heuristic
  const commaMatch = s.match(/^(\d+),(\d+)$/)
  if (commaMatch) {
    const afterComma = commaMatch[2]
    if (afterComma.length === 3) {
      // 50,000 → 50000 (thousands)
      return parseInt(s.replace(',', ''), 10)
    }
    // 50,5 → 50.5 (decimal)
    return parseFloat(s.replace(',', '.'))
  }

  return null
}

/**
 * Formats a number as IDR display: "Rp 50,000"
 * Comma thousands, no decimals, "Rp" + space.
 */
export function formatAmountIDR(n: number): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
  return `Rp ${formatted}`
}
