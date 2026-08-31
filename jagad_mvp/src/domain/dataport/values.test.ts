import { describe, expect, it } from 'vitest'
import {
  comparisonKey,
  excelSerialToIso,
  paiseToRupees,
  parseAadhaarLast4,
  parseEmail,
  parseIsoDate,
  parseMobile,
  parsePaise,
  parseWholeNumber,
} from './values'
import type { Parsed } from './values'

function value<T>(parsed: Parsed<T>): T {
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.value
}

function reason<T>(parsed: Parsed<T>): string {
  expect(parsed.ok).toBe(false)
  return parsed.ok ? '' : parsed.reason
}

describe('parsePaise', () => {
  it('reads rupees and paise in integer arithmetic', () => {
    // The whole point: 1234.35 through parseFloat times 100 is 123434.99999999999.
    expect(value(parsePaise('1234.35'))).toBe(123435)
    expect(value(parsePaise('0.07'))).toBe(7)
    expect(value(parsePaise('1234'))).toBe(123400)
    expect(value(parsePaise('1234.5'))).toBe(123450)
  })

  it('reads the shapes an agency file actually holds', () => {
    expect(value(parsePaise('  ₹ 12,48,500.00 '))).toBe(124850000)
    expect(value(parsePaise('Rs. 1,234.35'))).toBe(123435)
    expect(value(parsePaise('INR 500'))).toBe(50000)
    expect(value(parsePaise('(1,234.35)'))).toBe(-123435)
    expect(value(parsePaise('-1234.35'))).toBe(-123435)
  })

  it('refuses more precision than paise rather than rounding it away', () => {
    expect(reason(parsePaise('1234.356'))).toMatch(/more precision than paise/)
    // Trailing zeros are not extra precision.
    expect(value(parsePaise('1234.3500'))).toBe(123435)
  })

  it('refuses anything that is not a figure', () => {
    expect(reason(parsePaise('12,4o0'))).toMatch(/not an amount/)
    expect(reason(parsePaise(''))).toMatch(/empty/)
  })

  it('renders back to rupees for a file a human reads', () => {
    expect(paiseToRupees(123435)).toBe('1234.35')
    expect(paiseToRupees(7)).toBe('0.07')
    expect(paiseToRupees(0)).toBe('0.00')
    expect(paiseToRupees(-123435)).toBe('-1234.35')
  })

  it('round trips every amount it accepts', () => {
    for (const paise of [0, 1, 99, 100, 123435, 124850000, -507]) {
      expect(value(parsePaise(paiseToRupees(paise)))).toBe(paise)
    }
  })
})

describe('excelSerialToIso', () => {
  it('handles the 1900 leap-year bug', () => {
    expect(value(excelSerialToIso(1))).toBe('1900-01-01')
    expect(value(excelSerialToIso(59))).toBe('1900-02-28')
    // Serial 60 is Excel's phantom 29 February 1900, a day that never existed.
    expect(reason(excelSerialToIso(60))).toMatch(/never existed/)
    expect(value(excelSerialToIso(61))).toBe('1900-03-01')
  })

  it('handles the dates a policy file actually holds', () => {
    expect(value(excelSerialToIso(45383))).toBe('2024-04-01')
    expect(value(excelSerialToIso(25569))).toBe('1970-01-01')
  })

  it('refuses a serial outside the calendar', () => {
    expect(reason(excelSerialToIso(0))).toMatch(/not a date/)
    expect(reason(excelSerialToIso(9_999_999))).toMatch(/not a date/)
  })
})

describe('parseIsoDate', () => {
  it('reads ISO, including a full timestamp', () => {
    expect(value(parseIsoDate('2025-04-03'))).toBe('2025-04-03')
    expect(value(parseIsoDate('2025-04-03T09:15:00.000Z'))).toBe('2025-04-03')
  })

  it('reads day first, because this is an Indian agency book', () => {
    expect(value(parseIsoDate('03/04/2025'))).toBe('2025-04-03')
    expect(value(parseIsoDate('3-4-2025'))).toBe('2025-04-03')
    expect(value(parseIsoDate('03.04.25'))).toBe('2025-04-03')
  })

  it('reads a named month', () => {
    expect(value(parseIsoDate('3-Apr-2025'))).toBe('2025-04-03')
    expect(value(parseIsoDate('03 December 2025'))).toBe('2025-12-03')
  })

  it('refuses a date that is not a date', () => {
    expect(reason(parseIsoDate('31/02/2025'))).toMatch(/not a real date/)
    expect(reason(parseIsoDate('next tuesday'))).toMatch(/is not a date/)
  })

  it('reads an Excel serial only when the column is a date column', () => {
    expect(reason(parseIsoDate('45383'))).toMatch(/is not a date/)
    expect(value(parseIsoDate('45383', { allowSerial: true }))).toBe('2024-04-01')
  })
})

describe('parseMobile', () => {
  it('normalises every spelling of one number to ten digits', () => {
    for (const written of ['9825012345', '+91 98250 12345', '098250-12345', '(982) 501 2345']) {
      expect(value(parseMobile(written))).toBe('9825012345')
    }
  })

  it('refuses what is not a mobile number', () => {
    expect(reason(parseMobile('98250'))).toMatch(/ten-digit/)
    expect(reason(parseMobile('1234567890'))).toMatch(/6, 7, 8 or 9/)
  })
})

describe('parseAadhaarLast4', () => {
  it('takes the last four digits', () => {
    expect(value(parseAadhaarLast4('4021'))).toBe('4021')
    expect(value(parseAadhaarLast4('XXXX XXXX 4021'))).toBe('4021')
  })

  it('refuses a full Aadhaar instead of helpfully truncating it', () => {
    // Truncating would mean a whole Aadhaar had been accepted by this system and
    // nobody had been told to take it out of their file.
    expect(reason(parseAadhaarLast4('2345 6789 4021'))).toMatch(/full Aadhaar number/)
  })
})

describe('the small ones', () => {
  it('parses numbers and emails, and refuses what is neither', () => {
    expect(value(parseWholeNumber(' 1,250 '))).toBe(1250)
    expect(reason(parseWholeNumber('twelve'))).toMatch(/not a number/)
    expect(value(parseEmail(' Rakesh@Example.COM '))).toBe('rakesh@example.com')
    expect(reason(parseEmail('rakesh at example'))).toMatch(/not an email/)
  })

  it('compares text the way a person would', () => {
    expect(comparisonKey('  Rakesh   Patel ')).toBe('rakesh patel')
  })
})
