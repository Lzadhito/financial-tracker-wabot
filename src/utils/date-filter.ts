export type DateFilter =
  | { type: 'period'; period: 'today' | 'week' | 'month' }
  | { type: 'range'; start: Date; end: Date; label: string }

/**
 * Parse slash command args into a DateFilter.
 * Supported args:
 *   (none)         → current month
 *   today          → today
 *   week           → last 7 days
 *   month          → current month
 *   MM/YYYY        → specific month/year
 *   MM/DD/YYYY     → specific day
 *   YYYY           → full year
 */
export function parseDateFilter(args: string[]): DateFilter {
  if (args.length === 0) {
    return { type: 'period', period: 'month' }
  }

  const raw = args[0].trim().toLowerCase()

  if (raw === 'today') return { type: 'period', period: 'today' }
  if (raw === 'week') return { type: 'period', period: 'week' }
  if (raw === 'month') return { type: 'period', period: 'month' }

  // Try YYYY (4-digit year only)
  if (/^\d{4}$/.test(raw)) {
    const year = parseInt(raw, 10)
    const start = new Date(year, 0, 1, 0, 0, 0, 0)
    const end = new Date(year + 1, 0, 1, 0, 0, 0, 0)
    return { type: 'range', start, end, label: String(year) }
  }

  // Try MM/YYYY
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

  // Fallback to current month
  return { type: 'period', period: 'month' }
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
      const label = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      return { start, end: now, label }
    }
  }
}
