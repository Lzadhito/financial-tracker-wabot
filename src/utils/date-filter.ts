import { addDays, addMonths, subDays, startOfDay, startOfMonth, getYear, format } from 'date-fns'
import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz'

const JAKARTA_TZ = 'Asia/Jakarta'

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

const MONTH_NAMES_SET = new Set(Object.keys(MONTH_MAP))

/**
 * Returns true if the arg looks like a date/period token (not a person's name).
 * Used to split name tokens from date tokens in slash command args.
 */
export function looksLikeDateArg(arg: string): boolean {
  const lower = arg.trim().toLowerCase()
  if (['today', 'week', 'month'].includes(lower)) return true
  if (MONTH_NAMES_SET.has(lower)) return true
  if (/^\d{4}$/.test(lower)) return true         // YYYY
  if (/^\d{1,2}\/\d{4}$/.test(lower)) return true   // MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(lower)) return true  // MM/DD/YYYY
  if (/^\d{1,2}$/.test(lower)) return true        // day number
  return false
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
    const start = fromZonedTime(new Date(year, 0, 1), JAKARTA_TZ)
    const end = fromZonedTime(new Date(year + 1, 0, 1), JAKARTA_TZ)
    return { type: 'range', start, end, label: String(year) }
  }

  // Try MM/YYYY (single arg)
  if (args.length === 1) {
    const monthYear = raw.match(/^(\d{1,2})\/(\d{4})$/)
    if (monthYear) {
      const month = parseInt(monthYear[1], 10) - 1
      const year = parseInt(monthYear[2], 10)
      if (month >= 0 && month <= 11) {
        const start = fromZonedTime(new Date(year, month, 1), JAKARTA_TZ)
        const end = fromZonedTime(addMonths(new Date(year, month, 1), 1), JAKARTA_TZ)
        const label = format(new Date(year, month, 1), 'MMMM yyyy')
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
        const start = fromZonedTime(new Date(year, month, day), JAKARTA_TZ)
        const end = fromZonedTime(addDays(new Date(year, month, day), 1), JAKARTA_TZ)
        const label = format(new Date(year, month, day), 'MMM d, yyyy')
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
  const currentYear = getYear(new Date())
  const tokens = text.split(/\s+/)

  const monthTokenIdx = tokens.findIndex((t) => MONTH_MAP[t] !== undefined)
  const yearTokenIdx = tokens.findIndex((t) => /^\d{4}$/.test(t))
  const dayTokenIdx = tokens.findIndex((t, i) => i !== yearTokenIdx && /^\d{1,2}$/.test(t))

  if (monthTokenIdx === -1) return null

  const month = MONTH_MAP[tokens[monthTokenIdx]]
  const year = yearTokenIdx !== -1 ? parseInt(tokens[yearTokenIdx], 10) : currentYear
  const day = dayTokenIdx !== -1 ? parseInt(tokens[dayTokenIdx], 10) : null

  if (day !== null && day >= 1 && day <= 31) {
    const start = fromZonedTime(new Date(year, month, day), JAKARTA_TZ)
    const end = fromZonedTime(addDays(new Date(year, month, day), 1), JAKARTA_TZ)
    const label = format(new Date(year, month, day), 'MMM d, yyyy')
    return { type: 'range', start, end, label }
  }

  // Month range
  const start = fromZonedTime(new Date(year, month, 1), JAKARTA_TZ)
  const end = fromZonedTime(addMonths(new Date(year, month, 1), 1), JAKARTA_TZ)
  const label = format(new Date(year, month, 1), 'MMMM yyyy')
  return { type: 'range', start, end, label }
}

/** Convert any DateFilter to a concrete {start, end, label} range. */
export function dateFilterToRange(filter: DateFilter): { start: Date; end: Date; label: string } {
  if (filter.type === 'range') {
    return { start: filter.start, end: filter.end, label: filter.label }
  }

  // Use getUTC* on toZonedTime result — the pseudo-UTC value encodes Jakarta local time,
  // so getUTC* gives Jakarta date components independent of system timezone.
  const nowZoned = toZonedTime(new Date(), JAKARTA_TZ)
  const y = nowZoned.getUTCFullYear()
  const mo = nowZoned.getUTCMonth()
  const d = nowZoned.getUTCDate()

  switch (filter.period) {
    case 'today': {
      const start = fromZonedTime(new Date(Date.UTC(y, mo, d)), JAKARTA_TZ)
      const end = fromZonedTime(new Date(Date.UTC(y, mo, d + 1)), JAKARTA_TZ)
      return { start, end, label: 'Today' }
    }
    case 'week': {
      const start = fromZonedTime(new Date(Date.UTC(y, mo, d - 7)), JAKARTA_TZ)
      const end = fromZonedTime(new Date(Date.UTC(y, mo, d + 1)), JAKARTA_TZ)
      return { start, end, label: 'Last 7 Days' }
    }
    case 'month':
    default: {
      const start = fromZonedTime(new Date(Date.UTC(y, mo, 1)), JAKARTA_TZ)
      const end = fromZonedTime(new Date(Date.UTC(y, mo + 1, 1)), JAKARTA_TZ)
      const label = formatInTimeZone(new Date(), JAKARTA_TZ, 'MMMM yyyy')
      return { start, end, label }
    }
  }
}
