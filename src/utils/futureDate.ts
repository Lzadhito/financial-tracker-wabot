/**
 * Detect future date signals in text
 * Returns true if text contains date keywords suggesting entry is for future
 */
export function isFutureDated(text: string): boolean {
  const pattern = /\b(tomorrow|besok|lusa|next\s+week|minggu\s+depan|next\s+month|bulan\s+depan)\b/i
  return pattern.test(text)
}
