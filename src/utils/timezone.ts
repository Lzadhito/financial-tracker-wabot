/**
 * Timezone utilities — all times in UTC+7 (Asia/Jakarta)
 */

import { subMinutes } from 'date-fns'

export const JAKARTA_TZ = 'Asia/Jakarta'

/**
 * Format date/time in Jakarta timezone (UTC+7)
 */
export function formatTimeJakarta(date: Date, format: 'time' | 'date-time' = 'time'): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: JAKARTA_TZ,
    ...(format === 'time'
      ? { hour: '2-digit', minute: '2-digit', hour12: true }
      : {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
  })
  return formatter.format(date)
}

/**
 * Get today's date in Jakarta timezone
 */
export function getTodayInJakarta(): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: JAKARTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(new Date())
  const dateMap = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  const baseDate = new Date(`${dateMap.year}-${dateMap.month}-${dateMap.day}T00:00:00`)
  const offset = getJakartaOffsetMinutes()
  return subMinutes(baseDate, offset)
}

/**
 * Get UTC+7 offset in minutes
 */
export function getJakartaOffsetMinutes(): number {
  // UTC+7 = 420 minutes
  // But we need to account for actual offset from current time
  const nowUTC = new Date()
  const jakartaFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: JAKARTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const jakartaStr = jakartaFormatter.format(nowUTC)
  const jakartaDate = new Date(jakartaStr.replace(/(\d{2})\/(\d{2})\/(\d{4}).*/, '$3-$1-$2'))
  const offset = nowUTC.getTime() - jakartaDate.getTime()
  return offset / 1000 / 60
}
