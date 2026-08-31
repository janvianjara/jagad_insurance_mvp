/**
 * Turning a spreadsheet cell into a typed value, or into a reason it is not one.
 *
 * Every parser here returns a `Parsed` rather than throwing or returning `null`,
 * because the importer's job is to tell the operator which cell is wrong and
 * why. "6 rows failed" is useless; "row 14, Premium: 12,4o0 — that is a letter o,
 * not a zero" is what gets a file fixed.
 *
 * The money rule is the one to read twice. D3 says amounts are recorded, never
 * computed, and that survives here in two ways: a figure is parsed in **integer
 * arithmetic on the string** — `Math.round(parseFloat(x) * 100)` loses a paise on
 * ordinary values like 1234.35 — and a cell carrying more precision than paise is
 * refused rather than rounded. Rounding somebody's premium without telling them
 * is computing money.
 */

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string }

function ok<T>(value: T): Parsed<T> {
  return { ok: true, value }
}

function bad<T>(reason: string): Parsed<T> {
  return { ok: false, reason }
}

/* -------------------------------------------------------------------- money */

/** Currency marks and grouping an Indian agency's file actually contains. */
const MONEY_NOISE = /rs\.?|inr|₹|[\s,]/gi

/**
 * Rupees as typed, to integer paise.
 *
 * Accepts `1234`, `1,234.35`, `₹ 1,234.35`, `Rs. 1234.35` and `(1,234.35)` for a
 * negative, which is how accounting exports write one.
 */
export function parsePaise(input: string): Parsed<number> {
  const trimmed = input.trim()
  if (trimmed === '') return bad('is empty')

  let body = trimmed
  let sign = 1
  if (body.startsWith('(') && body.endsWith(')')) {
    sign = -1
    body = body.slice(1, -1)
  }
  body = body.replace(MONEY_NOISE, '')
  if (body.startsWith('-')) {
    sign = -sign
    body = body.slice(1)
  } else if (body.startsWith('+')) {
    body = body.slice(1)
  }

  const match = /^(\d*)(?:\.(\d*))?$/.exec(body)
  if (match === null || (match[1] ?? '') === '') {
    return bad(`is not an amount — "${trimmed}" has something in it that is not a digit`)
  }

  const rupees = match[1] ?? '0'
  const fraction = match[2] ?? ''
  if (fraction.length > 2 && !/^0*$/.test(fraction.slice(2))) {
    return bad(
      `carries more precision than paise ("${trimmed}"). Round it in the file to two decimal places, so the figure recorded is the one you meant`,
    )
  }

  const paisePart = `${fraction}00`.slice(0, 2)
  const total = sign * (Number(rupees) * 100 + Number(paisePart))
  if (!Number.isSafeInteger(total)) return bad(`is too large to record ("${trimmed}")`)
  return ok(total)
}

/** Integer paise back to the rupee string a person and Excel both read. */
export function paiseToRupees(paise: number): string {
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  const rupees = Math.floor(abs / 100)
  const remainder = abs % 100
  return `${sign}${rupees}.${String(remainder).padStart(2, '0')}`
}

/* --------------------------------------------------------------------- date */

const MONTH_NAMES = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const

/** Excel's serial 60 is 1900-02-29, a day that never existed. Nothing may be it. */
const LEAP_BUG_SERIAL = 60
const MAX_SERIAL = 2_958_465 // 9999-12-31

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * An Excel date serial to `yyyy-MM-dd`.
 *
 * Serial 1 is 1900-01-01. Lotus 1-2-3 believed 1900 was a leap year, Excel kept
 * the bug for compatibility, and so every serial above 59 is one day ahead of the
 * real count — which is why the epoch below is 1899-12-31 and everything past the
 * phantom 29 February loses a day back.
 */
export function excelSerialToIso(serial: number): Parsed<string> {
  if (!Number.isFinite(serial) || serial < 1 || serial > MAX_SERIAL) {
    return bad(`is not a date this reader recognises (Excel day number ${serial})`)
  }
  if (Math.trunc(serial) === LEAP_BUG_SERIAL) {
    return bad('is Excel day 60, which is 29 February 1900 — a date that never existed')
  }
  const days = Math.trunc(serial) > LEAP_BUG_SERIAL ? Math.trunc(serial) - 1 : Math.trunc(serial)
  const date = new Date(Date.UTC(1899, 11, 31) + days * 86_400_000)
  return ok(iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()))
}

export type ParseDateOptions = {
  /**
   * Whether a bare number may be an Excel serial. True for a column the spec
   * calls a date, false everywhere else — this is the whole reason the reader
   * leaves numbers alone.
   */
  readonly allowSerial?: boolean
}

/**
 * A date cell to `yyyy-MM-dd`.
 *
 * Day-first is the reading for `03/04/2025`: this is an Indian agency's book, and
 * a silent month-first reading would move a policy's expiry by nine months
 * without anybody seeing it. Anything genuinely ambiguous stays day-first and
 * anything impossible is refused.
 */
export function parseIsoDate(input: string, options: ParseDateOptions = {}): Parsed<string> {
  const text = input.trim()
  if (text === '') return bad('is empty')

  // ISO first, including a full timestamp, which is what an export re-uploaded
  // unchanged will carry.
  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/.exec(text)
  if (isoMatch) {
    const [year, month, day] = [Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])]
    return isRealDate(year, month, day) ? ok(iso(year, month, day)) : bad(`is not a real date ("${text}")`)
  }

  const dmyMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text)
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = Number(dmyMatch[2])
    const rawYear = Number(dmyMatch[3])
    const year = (dmyMatch[3] ?? '').length === 2 ? (rawYear >= 70 ? 1900 + rawYear : 2000 + rawYear) : rawYear
    if (!isRealDate(year, month, day)) {
      return bad(
        `is not a real date ("${text}"). Dates are read day first, so 03/04/2025 is 3 April 2025`,
      )
    }
    return ok(iso(year, month, day))
  }

  const namedMatch = /^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2}|\d{4})$/.exec(text)
  if (namedMatch) {
    const day = Number(namedMatch[1])
    const month = MONTH_NAMES.indexOf((namedMatch[2] ?? '').slice(0, 3).toLowerCase() as (typeof MONTH_NAMES)[number]) + 1
    const rawYear = Number(namedMatch[3])
    const year = (namedMatch[3] ?? '').length === 2 ? 2000 + rawYear : rawYear
    if (month > 0 && isRealDate(year, month, day)) return ok(iso(year, month, day))
    return bad(`is not a real date ("${text}")`)
  }

  if (options.allowSerial === true && /^\d+(?:\.\d+)?$/.test(text)) {
    return excelSerialToIso(Number(text))
  }

  return bad(
    `is not a date ("${text}"). Write it as 2025-04-03, 03/04/2025 or 3-Apr-2025`,
  )
}

/* -------------------------------------------------------------------- other */

export function parseWholeNumber(input: string): Parsed<number> {
  const text = input.trim().replace(/[\s,\u00a0]/g, '')
  if (text === '') return bad('is empty')
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return bad(`is not a number ("${input.trim()}")`)
  const value = Number(text)
  if (!Number.isFinite(value)) return bad(`is not a number ("${input.trim()}")`)
  return ok(value)
}

/** Everything that is not a digit, which is what two phone numbers are compared on. */
export function digitsOf(input: string): string {
  return input.replace(/\D+/g, '')
}

/**
 * An Indian mobile number, normalised to its ten national digits.
 *
 * A country code, a leading zero, spaces, dashes and brackets are all noise the
 * agency's old book is full of; two rows holding `+91 98250 12345` and
 * `09825012345` are the same customer, and duplicate detection only works if
 * they compare equal.
 */
export function parseMobile(input: string): Parsed<string> {
  const text = input.trim()
  if (text === '') return bad('is empty')
  let digits = digitsOf(text)
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 13 && digits.startsWith('091')) digits = digits.slice(3)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)

  if (digits.length !== 10) {
    return bad(`is not a ten-digit mobile number ("${text}")`)
  }
  if (!/^[6-9]/.test(digits)) {
    return bad(`does not start 6, 7, 8 or 9, so it is not a mobile number ("${text}")`)
  }
  return ok(digits)
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/

export function parseEmail(input: string): Parsed<string> {
  const text = input.trim()
  if (text === '') return bad('is empty')
  if (!EMAIL_PATTERN.test(text)) return bad(`is not an email address ("${text}")`)
  return ok(text.toLowerCase())
}

/**
 * The last four digits of an Aadhaar, and never more.
 *
 * The constitution allows last-4 in staff UI and nothing else anywhere. So this
 * accepts a masked value or a bare four digits, and **refuses a full twelve-digit
 * number outright** rather than helpfully truncating it: truncating would mean a
 * complete Aadhaar had been in a file this system accepted, and the operator
 * would never be told to take it out of theirs.
 */
export function parseAadhaarLast4(input: string): Parsed<string> {
  const text = input.trim()
  if (text === '') return bad('is empty')
  const digits = digitsOf(text)
  if (digits.length === 12) {
    return bad(
      'is a full Aadhaar number. This system stores the last four digits only — remove the first eight from your file before importing',
    )
  }
  if (digits.length !== 4) return bad(`is not the last four digits of an Aadhaar ("${text}")`)
  return ok(digits)
}

/** How two text values are compared for "this is the same record". */
export function comparisonKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
