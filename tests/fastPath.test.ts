import { describe, test, expect } from 'bun:test'
import { fastPath } from '../src/nlu/fastPath'

describe('fastPath', () => {
  // ── Menu / greeting triggers ──────────────────────────────────────
  test('menu → show_menu', () => {
    const r = fastPath('menu')
    expect(r?.intent).toBe('show_menu')
  })

  test('help → show_menu', () => {
    const r = fastPath('help')
    expect(r?.intent).toBe('show_menu')
  })

  test('hi → show_menu', () => {
    const r = fastPath('hi')
    expect(r?.intent).toBe('show_menu')
  })

  test('hello → show_menu', () => {
    const r = fastPath('hello')
    expect(r?.intent).toBe('show_menu')
  })

  test('halo → show_menu', () => {
    const r = fastPath('halo')
    expect(r?.intent).toBe('show_menu')
  })

  // ── Report triggers ──────────────────────────────────────────────
  test('report → query_spending', () => {
    const r = fastPath('report')
    expect(r?.intent).toBe('query_spending')
  })

  test('summary → query_spending', () => {
    const r = fastPath('summary')
    expect(r?.intent).toBe('query_spending')
  })

  // ── Undo / delete triggers ───────────────────────────────────────
  test('undo → delete_last', () => {
    const r = fastPath('undo')
    expect(r?.intent).toBe('delete_last')
  })

  test('batalin → delete_last', () => {
    const r = fastPath('batalin')
    expect(r?.intent).toBe('delete_last')
  })

  // ── Amount + label (amount first) ────────────────────────────────
  test('50rb kopi → add_expense', () => {
    const r = fastPath('50rb kopi')
    expect(r?.intent).toBe('add_expense')
    expect(r?.entities.amount).toBe(50000)
    expect(r?.entities.category).toBe('food')
  })

  test('50k coffee → add_expense', () => {
    const r = fastPath('50k coffee')
    expect(r?.intent).toBe('add_expense')
    expect(r?.entities.amount).toBe(50000)
  })

  test('Rp 50.000 ojek → add_expense transport', () => {
    const r = fastPath('Rp 50.000 ojek')
    expect(r?.intent).toBe('add_expense')
    expect(r?.entities.amount).toBe(50000)
    expect(r?.entities.category).toBe('transport')
  })

  test('25000 lunch → add_expense', () => {
    const r = fastPath('25000 lunch')
    expect(r?.intent).toBe('add_expense')
    expect(r?.entities.amount).toBe(25000)
    expect(r?.entities.category).toBe('food')
  })

  // ── Amount + label (label first) ─────────────────────────────────
  test('kopi 50rb → add_expense', () => {
    const r = fastPath('kopi 50rb')
    expect(r?.intent).toBe('add_expense')
    expect(r?.entities.amount).toBe(50000)
    expect(r?.entities.category).toBe('food')
  })

  test('lunch 35000 → add_expense', () => {
    const r = fastPath('lunch 35000')
    expect(r?.intent).toBe('add_expense')
    expect(r?.entities.amount).toBe(35000)
  })

  // ── Explicit "add/spent" ─────────────────────────────────────────
  test('spent 50k lunch → add_expense', () => {
    const r = fastPath('spent 50k lunch')
    expect(r?.intent).toBe('add_expense')
    expect(r?.entities.amount).toBe(50000)
    expect(r?.entities.category).toBe('food')
  })

  test('beli 25k kopi starbucks → add_expense', () => {
    const r = fastPath('beli 25k kopi starbucks')
    expect(r?.intent).toBe('add_expense')
    expect(r?.entities.amount).toBe(25000)
    expect(r?.entities.category).toBe('food')
  })

  // ── Income ───────────────────────────────────────────────────────
  test('income 5jt salary → add_income', () => {
    const r = fastPath('income 5jt salary')
    expect(r?.intent).toBe('add_income')
    expect(r?.entities.amount).toBe(5000000)
  })

  test('gaji 5jt → add_income', () => {
    const r = fastPath('gaji 5jt')
    expect(r?.intent).toBe('add_income')
    expect(r?.entities.amount).toBe(5000000)
  })

  // ── Budget ───────────────────────────────────────────────────────
  test('budget 2jt → set_budget', () => {
    const r = fastPath('budget 2jt')
    expect(r?.intent).toBe('set_budget')
    expect(r?.entities.amount).toBe(2000000)
  })

  // ── Budget variants ───────────────────────────────────────────────
  test('budget set 2jt → set_budget', () => {
    const r = fastPath('budget set 2jt')
    expect(r?.intent).toBe('set_budget')
    expect(r?.entities.amount).toBe(2000000)
  })

  // ── Income variants ──────────────────────────────────────────────
  test('pemasukan 5jt → add_income', () => {
    const r = fastPath('pemasukan 5jt')
    expect(r?.intent).toBe('add_income')
    expect(r?.entities.amount).toBe(5000000)
  })

  // ── Fallthrough (ambiguous) ──────────────────────────────────────
  test('bare number → null', () => {
    expect(fastPath('350')).toBeNull()
  })

  test('ambiguous sentence → null', () => {
    expect(fastPath('berapa pengeluaran bulan ini')).toBeNull()
  })

  test('empty → null', () => {
    expect(fastPath('')).toBeNull()
  })

  test('query-like → null (falls through)', () => {
    // "50k berapa" should not match as expense
    // Actually "50k berapa" → amount prefix catches it but "berapa" is query word
    const r = fastPath('50k berapa')
    expect(r).toBeNull()
  })
})
