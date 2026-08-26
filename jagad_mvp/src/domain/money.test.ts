import { describe, expect, it } from 'vitest'
import {
  addMoney,
  compareMoney,
  equalsMoney,
  formatINR,
  fromPaise,
  isMoney,
  isZero,
  money,
  sumMoney,
  zero,
} from './money'

describe('money construction', () => {
  it('stores rupees as integer paise', () => {
    expect(money(1200).paise).toBe(120000)
    expect(money(1200, 50).paise).toBe(120050)
  })

  it('refuses a float, because the precision was already lost before it arrived', () => {
    expect(() => money(1200.5)).toThrow(TypeError)
    expect(() => money(0.1)).toThrow(TypeError)
    expect(() => fromPaise(120050.5)).toThrow(TypeError)
  })

  it('refuses a paise part outside 0 to 99', () => {
    expect(() => money(1200, 100)).toThrow(RangeError)
    expect(() => money(1200, -1)).toThrow(RangeError)
  })

  it('keeps the paise part on the same side of zero as the rupees', () => {
    expect(money(-1200, 50).paise).toBe(-120050)
  })

  it('recognises its own values', () => {
    expect(isMoney(money(1))).toBe(true)
    expect(isMoney({ paise: 100, currency: 'USD' })).toBe(false)
    expect(isMoney(100)).toBe(false)
    expect(isZero(zero())).toBe(true)
  })
})

describe('money arithmetic', () => {
  it('adds without float drift across a long component list', () => {
    const components = [
      money(18200, 33),
      money(2145, 67),
      money(999, 99),
      money(1, 1),
      money(0, 1),
    ]
    const net = sumMoney(components)

    expect(net.paise).toBe(1820033 + 214567 + 99999 + 101 + 1)
    expect(Number.isInteger(net.paise)).toBe(true)
  })

  it('sums an empty component list to zero, so an untouched roll-up still renders', () => {
    expect(equalsMoney(sumMoney([]), zero())).toBe(true)
  })

  it('models Final = Net + GST as plain addition', () => {
    const net = sumMoney([money(15000), money(3200)])
    const gst = money(3276)

    expect(formatINR(addMoney(net, gst))).toBe('₹21,476.00')
  })

  it('refuses to combine different currencies', () => {
    const inr = money(100)
    const other = { paise: 100, currency: 'USD' } as unknown as typeof inr

    expect(() => addMoney(inr, other)).toThrow(TypeError)
    expect(() => compareMoney(inr, other)).toThrow(TypeError)
  })

  it('orders amounts', () => {
    expect(compareMoney(money(100), money(200))).toBeLessThan(0)
    expect(compareMoney(money(200), money(200))).toBe(0)
  })

  it('offers no way to multiply, divide or take a percentage of an amount', async () => {
    const api = await import('./money')
    const names = Object.keys(api)

    expect(names.filter((name) => /multiply|divide|percent|split|prorate/i.test(name))).toEqual([])
  })
})

describe('formatINR', () => {
  it('groups in the Indian system', () => {
    expect(formatINR(money(1248500))).toBe('₹12,48,500.00')
    expect(formatINR(money(1, 5))).toBe('₹1.05')
  })

  it('can drop the symbol for a column that carries it in the header', () => {
    expect(formatINR(money(1248500), { symbol: false })).toBe('12,48,500.00')
  })

  it('can drop a zero paise part, but never a non-zero one', () => {
    expect(formatINR(money(18200), { paise: false })).toBe('₹18,200')
    expect(formatINR(money(18200, 50), { paise: false })).toBe('₹18,200.50')
  })

  it('shows negative amounts as negative', () => {
    expect(formatINR(fromPaise(-120050))).toBe('-₹1,200.50')
  })
})
