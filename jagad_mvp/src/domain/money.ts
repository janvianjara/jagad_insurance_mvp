/**
 * Money — plan §8 "Money as a type".
 *
 * Record-only does not mean careless. Every amount is integer paise in a branded
 * type with an explicit currency; a float never becomes an amount, and formatting
 * happens at the render edge only.
 *
 * What is deliberately absent: there is no multiply, no divide, no percentage.
 * Those are how a platform computes money, and this one records it (D3). The only
 * arithmetic the product allows is addition — Net is the sum of typed components,
 * Final is Net plus a typed GST figure. A later step that genuinely needs a
 * proportion (the commission chain) states that intent in its own module rather
 * than borrowing a general-purpose calculator from here.
 */

declare const moneyBrand: unique symbol

export const CURRENCIES = ['INR'] as const
export type Currency = (typeof CURRENCIES)[number]

export type Money = {
  readonly paise: number
  readonly currency: Currency
  readonly [moneyBrand]: true
}

const PAISE_PER_RUPEE = 100

function build(paise: number, currency: Currency): Money {
  return { paise, currency } as Money
}

function assertSafeInteger(value: number, what: string): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(
      `${what} must be a whole number, received ${value}. ` +
        'Amounts are integer paise — a fractional value here is a float that lost precision before it arrived.',
    )
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${what} is outside the safe integer range: ${value}.`)
  }
}

/**
 * Builds an amount from rupees and, optionally, the paise part.
 *
 * Throws on anything fractional: `money(1200.5)` is a float that has already lost
 * precision, and the throw is what stops it entering the ledger. Use
 * `money(1200, 50)` instead.
 */
export function money(rupees: number, paise = 0, currency: Currency = 'INR'): Money {
  assertSafeInteger(rupees, 'rupees')
  assertSafeInteger(paise, 'paise')

  if (paise < 0 || paise > 99) {
    throw new RangeError(`paise must be between 0 and 99, received ${paise}.`)
  }

  const sign = rupees < 0 ? -1 : 1
  return build(rupees * PAISE_PER_RUPEE + sign * paise, currency)
}

/** Builds an amount straight from integer paise — the shape stored and transported. */
export function fromPaise(paise: number, currency: Currency = 'INR'): Money {
  assertSafeInteger(paise, 'paise')
  return build(paise, currency)
}

export function zero(currency: Currency = 'INR'): Money {
  return build(0, currency)
}

export function isMoney(value: unknown): value is Money {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Money).paise === 'number' &&
    CURRENCIES.includes((value as Money).currency)
  )
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Cannot combine ${a.currency} with ${b.currency}.`)
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  const total = a.paise + b.paise
  assertSafeInteger(total, 'total paise')
  return build(total, a.currency)
}

/** The roll-up primitive: Net is the sum of the typed components, nothing more. */
export function sumMoney(amounts: readonly Money[], currency: Currency = 'INR'): Money {
  return amounts.reduce(addMoney, zero(currency))
}

export function equalsMoney(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.paise === b.paise
}

export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b)
  return a.paise - b.paise
}

export function isZero(amount: Money): boolean {
  return amount.paise === 0
}

type FormatOptions = {
  /** Drop the currency symbol — for table cells that carry it in the column header. */
  symbol?: boolean
  /** Drop the paise part when it is zero, as insurer schedules usually print it. */
  paise?: boolean
}

/**
 * The render edge, and the only place an amount becomes a string. Indian digit
 * grouping, so 1248500 paise reads as the lakh figure a Gujarat agency expects.
 */
export function formatINR(amount: Money, options: FormatOptions = {}): string {
  const { symbol = true, paise = true } = options
  const showPaise = paise || amount.paise % PAISE_PER_RUPEE !== 0
  const digits = showPaise ? 2 : 0

  return new Intl.NumberFormat('en-IN', {
    style: symbol ? 'currency' : 'decimal',
    currency: amount.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount.paise / PAISE_PER_RUPEE)
}
