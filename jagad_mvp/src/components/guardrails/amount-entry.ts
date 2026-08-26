/**
 * Text in, integer paise out — the only translation `<RecordOnlyAmount>` performs.
 *
 * Deliberately not a calculator (D3). It parses what a person typed and prints
 * back what was recorded; there is no rounding rule, no rate, no percentage and
 * no default. `1204.35` becomes 120435 paise by string surgery rather than by
 * `Number(text) * 100`, because the float route turns 0.29 into 28.999999999999996
 * and an amount that drifts is not a record.
 */
import { fromPaise } from '../../domain/money'
import type { Currency, Money } from '../../domain/money'

const PAISE_PER_RUPEE = 100
const PAISE_DIGITS = 2

/** What a person is allowed to have in the control mid-keystroke, "1204." included. */
const DRAFT = /^-?\d*(\.\d{0,2})?$/

/** True while the text is a legal amount-in-progress. Anything else is refused at the key. */
export function isAmountDraft(text: string): boolean {
  return DRAFT.test(text)
}

/**
 * The typed text as an amount, or `null` when nothing has been recorded.
 *
 * An empty control is unrecorded, not zero: the difference is the whole point of
 * the component, and every caller downstream depends on it.
 */
export function parseAmountDraft(text: string, currency: Currency = 'INR'): Money | null {
  if (!isAmountDraft(text)) return null

  const negative = text.startsWith('-')
  const body = negative ? text.slice(1) : text
  const [rupeeText = '', paiseText = ''] = body.split('.')

  if (rupeeText === '' && paiseText === '') return null

  const rupees = rupeeText === '' ? 0 : Number(rupeeText)
  const paise = Number(`${paiseText}00`.slice(0, PAISE_DIGITS))
  if (!Number.isInteger(rupees) || !Number.isInteger(paise)) return null

  const total = rupees * PAISE_PER_RUPEE + paise
  return fromPaise(negative ? -total : total, currency)
}

/** The recorded amount as editable text. Whole rupees print without a paise part. */
export function amountDraft(amount: Money | null): string {
  if (amount === null) return ''

  const negative = amount.paise < 0
  const absolute = Math.abs(amount.paise)
  const rupees = Math.trunc(absolute / PAISE_PER_RUPEE)
  const paise = absolute % PAISE_PER_RUPEE
  const body = paise === 0 ? String(rupees) : `${rupees}.${String(paise).padStart(PAISE_DIGITS, '0')}`

  return negative ? `-${body}` : body
}

/** Amount equality that tolerates the unrecorded case on either side. */
export function sameAmount(a: Money | null, b: Money | null): boolean {
  if (a === null || b === null) return a === b
  return a.paise === b.paise && a.currency === b.currency
}
