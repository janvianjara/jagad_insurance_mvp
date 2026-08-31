import { describe, expect, it } from 'vitest'
import { readLadder, rungInstant } from './ladder'
import type { AutomationParameters } from './ladder'

const OK: AutomationParameters = {
  offsetsDays: '45,30,15,7,1',
  graceOffsetsDays: '3,10',
  maxReminders: 3,
  channel: 'whatsapp',
  templateKey: 'renewal.reminder',
}

/** The recipe as it stands minus one field, which is what "not configured" looks like. */
function without(key: string): AutomationParameters {
  return Object.fromEntries(Object.entries(OK).filter(([name]) => name !== key))
}

function reasonOf(parameters: AutomationParameters): string {
  const result = readLadder(parameters)
  if (result.ok) throw new Error('Expected this ladder to be refused, and it was read.')
  return result.reason
}

describe('the ladder is read from the recipe, never defaulted', () => {
  it('orders the rungs earliest first, with grace folded on as negative offsets', () => {
    const result = readLadder(OK)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ladder.rungs).toEqual([45, 30, 15, 7, 1, -3, -10])
    expect(result.ladder.maxSends).toBe(3)
  })

  it('reads a ladder with no grace rungs at all', () => {
    const result = readLadder(without('graceOffsetsDays'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ladder.rungs).toEqual([45, 30, 15, 7, 1])
  })

  it('refuses when the recipe carries no rungs, and says the rungs are configuration', () => {
    expect(reasonOf(without('offsetsDays'))).toMatch(/holds no default/)
  })

  it('refuses a rung that is not a whole number of days rather than rounding it', () => {
    expect(reasonOf({ ...OK, offsetsDays: '45,30,2.5' })).toMatch(/never rounded/)
  })

  it('refuses a ladder that lists the same rung twice', () => {
    expect(reasonOf({ ...OK, offsetsDays: '45,30,30' })).toMatch(/lists 30 twice/)
  })

  it('refuses a grace rung of 0, which is the anchor and belongs to the other field', () => {
    expect(reasonOf({ ...OK, graceOffsetsDays: '0,3' })).toMatch(/is the anchor itself/)
  })

  /**
   * The ceiling is the parameter an agency actually argues about, and "absent"
   * must not read as "no limit".
   */
  it('refuses a ladder with no ceiling, and says why there is no default for it', () => {
    expect(reasonOf(without('maxReminders'))).toMatch(/five messages in a week/)
  })

  it('accepts a ceiling of zero, which is a configured pause rather than a missing value', () => {
    const result = readLadder({ ...OK, maxReminders: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ladder.maxSends).toBe(0)
  })
})

describe('a rung is an instant measured back from the anchor', () => {
  it('puts a positive offset before the anchor and a grace offset after it', () => {
    expect(rungInstant('2026-08-28', 45).toISOString().slice(0, 10)).toBe('2026-07-14')
    expect(rungInstant('2026-08-28', 1).toISOString().slice(0, 10)).toBe('2026-08-27')
    expect(rungInstant('2026-08-28', -3).toISOString().slice(0, 10)).toBe('2026-08-31')
  })

  it('throws on an anchor that is not a date rather than measuring from NaN', () => {
    expect(() => rungInstant('not a date', 30)).toThrow(/is not a date/)
  })
})
