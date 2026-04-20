import { describe, test, expect } from 'bun:test'
import { normalizeAmount, formatAmountIDR } from '../src/nlu/indonesianNormalizer'

describe('normalizeAmount', () => {
  // ── rb / ribu suffix ──────────────────────────────────────────────
  test('50rb → 50000', () => expect(normalizeAmount('50rb')).toBe(50000))
  test('50 rb → 50000', () => expect(normalizeAmount('50 rb')).toBe(50000))
  test('50 ribu → 50000', () => expect(normalizeAmount('50 ribu')).toBe(50000))
  test('50.5rb → 50500', () => expect(normalizeAmount('50.5rb')).toBe(50500))
  test('50,5rb → 50500', () => expect(normalizeAmount('50,5rb')).toBe(50500))
  test('100rb → 100000', () => expect(normalizeAmount('100rb')).toBe(100000))
  test('2rb → 2000', () => expect(normalizeAmount('2rb')).toBe(2000))

  // ── k suffix ──────────────────────────────────────────────────────
  test('50k → 50000', () => expect(normalizeAmount('50k')).toBe(50000))
  test('50K → 50000', () => expect(normalizeAmount('50K')).toBe(50000))
  test('25k → 25000', () => expect(normalizeAmount('25k')).toBe(25000))
  test('1.5k → 1500', () => expect(normalizeAmount('1.5k')).toBe(1500))

  // ── jt / juta suffix ─────────────────────────────────────────────
  test('1jt → 1000000', () => expect(normalizeAmount('1jt')).toBe(1000000))
  test('1 juta → 1000000', () => expect(normalizeAmount('1 juta')).toBe(1000000))
  test('1.5jt → 1500000', () => expect(normalizeAmount('1.5jt')).toBe(1500000))
  test('1,5jt → 1500000', () => expect(normalizeAmount('1,5jt')).toBe(1500000))
  test('2jt → 2000000', () => expect(normalizeAmount('2jt')).toBe(2000000))
  test('Rp 1,5jt → 1500000', () => expect(normalizeAmount('Rp 1,5jt')).toBe(1500000))
  test('3.5jt → 3500000', () => expect(normalizeAmount('3.5jt')).toBe(3500000))

  // ── Rp prefix ─────────────────────────────────────────────────────
  test('Rp 50.000 → 50000', () => expect(normalizeAmount('Rp 50.000')).toBe(50000))
  test('Rp50000 → 50000', () => expect(normalizeAmount('Rp50000')).toBe(50000))
  test('Rp.50000 → 50000', () => expect(normalizeAmount('Rp.50000')).toBe(50000))
  test('Rp 1.500.000 → 1500000', () => expect(normalizeAmount('Rp 1.500.000')).toBe(1500000))

  // ── Plain formatted numbers ──────────────────────────────────────
  test('50000 → 50000', () => expect(normalizeAmount('50000')).toBe(50000))
  test('25000 → 25000', () => expect(normalizeAmount('25000')).toBe(25000))
  test('50.000 → 50000', () => expect(normalizeAmount('50.000')).toBe(50000))
  test('50,000 → 50000', () => expect(normalizeAmount('50,000')).toBe(50000))
  test('1.500.000 → 1500000', () => expect(normalizeAmount('1.500.000')).toBe(1500000))
  test('1,500,000 → 1500000', () => expect(normalizeAmount('1,500,000')).toBe(1500000))

  // ── Edge cases ───────────────────────────────────────────────────
  test('0 → 0', () => expect(normalizeAmount('0')).toBe(0))
  test('empty string → null', () => expect(normalizeAmount('')).toBe(null))
  test('abc → null', () => expect(normalizeAmount('abc')).toBe(null))
  test('350 → 350', () => expect(normalizeAmount('350')).toBe(350))
  test('whitespace only → null', () => expect(normalizeAmount('   ')).toBe(null))

  // ── Case insensitivity ───────────────────────────────────────────
  test('50RB → 50000', () => expect(normalizeAmount('50RB')).toBe(50000))
  test('1JT → 1000000', () => expect(normalizeAmount('1JT')).toBe(1000000))
  test('rp 50.000 → 50000', () => expect(normalizeAmount('rp 50.000')).toBe(50000))
})

describe('formatAmountIDR', () => {
  test('50000 → "Rp 50,000"', () => expect(formatAmountIDR(50000)).toBe('Rp 50,000'))
  test('1500000 → "Rp 1,500,000"', () => expect(formatAmountIDR(1500000)).toBe('Rp 1,500,000'))
  test('0 → "Rp 0"', () => expect(formatAmountIDR(0)).toBe('Rp 0'))
  test('350 → "Rp 350"', () => expect(formatAmountIDR(350)).toBe('Rp 350'))
  test('25000 → "Rp 25,000"', () => expect(formatAmountIDR(25000)).toBe('Rp 25,000'))
})
