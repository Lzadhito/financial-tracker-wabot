export type DateFilter =
  | { type: 'period'; period: 'today' | 'week' | 'month' }
  | { type: 'range'; start: Date; end: Date; label: string }

const MONTH_MAP: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
}

/**
 * Parse slash command args into a DateFilter.
 * Supported args:
 *   (none)              → current month
 *   today               → today
 *   week                → last 7 days
 *   month               → current month
 *   MM/YYYY             → specific month/year
 *   MM/DD/YYYY          → specific day
 *   YYYY                → full year
 *   April               → April (current year)
 *   April 2026          → April 2026
 *   16 April            → April 16 (current year)
 *   April 16            → April 16 (current year)
 *   16 April 2026       → April 16 2026
 */
export function parseDateFilter(args: string[]): DateFilter {
  if (args.length === 0) {
    return { type: 'period', period: 'month' }
  }

  const raw = args[0].trim().toLowerCase()

  if (raw === 'today') return { type: 'period', period: 'today' }
  if (raw === 'week') return { type: 'period', period: 'week' }
  if (raw === 'month') return { type: 'period', period: 'month' }

  // Try YYYY (4-digit year only, single arg)
  if (args.length === 1 && /^\d{4}$/.test(raw)) {
    const year = parseInt(raw, 10)
    const start = new Date(year, 0, 1, 0, 0, 0, 0)
    const end = new Date(year + 1, 0, 1, 0, 0, 0, 0)
    return { type: 'range', start, end, label: String(year) }
  }

  // Try MM/YYYY (single arg)
  if (args.length === 1) {
    const monthYear = raw.match(/^(\d{1,2})\/(\d{4})$/)
    if (monthYear) {
      const month = parseInt(monthYear[1], 10) - 1
      const year = parseInt(monthYear[2], 10)
      if (month >= 0 && month <= 11) {
        const start = new Date(year, month, 1, 0, 0, 0, 0)
        const end = new Date(year, month + 1, 1, 0, 0, 0, 0)
        const label = start.toLocaleString('en-US', { month: 'long', year: 'numeric' })
        return { type: 'range', start, end, label }
      }
    }

    // Try MM/DD/YYYY
    const fullDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (fullDate) {
      const month = parseInt(fullDate[1], 10) - 1
      const day = parseInt(fullDate[2], 10)
      const year = parseInt(fullDate[3], 10)
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        const start = new Date(year, month, day, 0, 0, 0, 0)
        const end = new Date(year, month, day + 1, 0, 0, 0, 0)
        const label = start.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        return { type: 'range', start, end, label }
      }
    }
  }

  // Natural language: join all args and try to parse month/day/year combos
  const combined = args.map((a) => a.trim().toLowerCase()).join(' ')
  const natural = parseNaturalDate(combined)
  if (natural) return natural

  // Fallback to current month
  return { type: 'period', period: 'month' }
}

/**
 * Parse natural-language date expressions like:
 *   "april"              → month range for April current year
 *   "april 2026"         → month range for April 2026
 *   "16 april"           → single day April 16 current year
 *   "april 16"           → single day April 16 current year
 *   "16 april 2026"      → single day April 16 2026
 *   "april 16 2026"      → single day April 16 2026
 */
function parseNaturalDate(text: string): DateFilter | null {
  const now = new Date()
  const currentYear = now.getFullYear()

  const tokens = text.split(/\s+/)

  // Categorize each token
  const monthTokenIdx = tokens.findIndex((t) => MONTH_MAP[t] !== undefined)
  const yearTokenIdx = tokens.findIndex((t) => /^\d{4}$/.test(t))
  const dayTokenIdx = tokens.findIndex((t, i) => i !== yearTokenIdx && /^\d{1,2}$/.test(t))

  if (monthTokenIdx === -1) return null

  const month = MONTH_MAP[tokens[monthTokenIdx]]
  const year = yearTokenIdx !== -1 ? parseInt(tokens[yearTokenIdx], 10) : currentYear
  const day = dayTokenIdx !== -1 ? parseInt(tokens[dayTokenIdx], 10) : null

  if (day !== null && day >= 1 && day <= 31) {
    // Specific day
    const start = new Date(year, month, day, 0, 0, 0, 0)
    const end = new Date(year, month, day + 1, 0, 0, 0, 0)
    const label = start.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return { type: 'range', start, end, label }
  }

  // Month range
  const start = new Date(year, month, 1, 0, 0, 0, 0)
  const end = new Date(year, month + 1, 1, 0, 0, 0, 0)
  const label = start.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  return { type: 'range', start, end, label }
}

/** Convert any DateFilter to a concrete {start, end, label} range. */
export function dateFilterToRange(filter: DateFilter): { start: Date; end: Date; label: string } {
  if (filter.type === 'range') {
    return { start: filter.start, end: filter.end, label: filter.label }
  }

  const now = new Date()

  switch (filter.period) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
      return { start, end, label: 'Today' }
    }
    case 'week': {
      const start = new Date(now)
      start.setDate(start.getDate() - 7)
      start.setHours(0, 0, 0, 0)
      return { start, end: now, label: 'Last 7 Days' }
    }
    case 'month':
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)
      const label = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      return { start, end, label }
    }
  }
}
