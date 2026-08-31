import { describe, expect, it } from 'vitest'

import { CONSENT_CADENCE, afterQuietHours, inQuietHours } from './cadence'

/** Local time, because quiet hours are a fact about the person receiving it. */
const at = (hour: number, day = 15) => new Date(2026, 8, day, hour, 0, 0)

describe('quiet hours', () => {
  it('is quiet from 21:00 through to 09:00, across midnight', () => {
    expect(inQuietHours(at(21))).toBe(true)
    expect(inQuietHours(at(23))).toBe(true)
    expect(inQuietHours(at(2))).toBe(true)
    expect(inQuietHours(at(8))).toBe(true)
  })

  it('is not quiet during the working day', () => {
    expect(inQuietHours(at(9))).toBe(false)
    expect(inQuietHours(at(13))).toBe(false)
    expect(inQuietHours(at(20))).toBe(false)
  })

  it('handles a window that does not wrap, so the same function serves both', () => {
    // The naive `hour >= start && hour < end` is never true for [21, 9]; this is
    // the case that proves the wrap is handled rather than special-cased away.
    expect(inQuietHours(at(13), [12, 14])).toBe(true)
    expect(inQuietHours(at(15), [12, 14])).toBe(false)
  })

  it('releases a held message at the edge of the window rather than dropping it', () => {
    const held = afterQuietHours(at(23))
    expect(held.getHours()).toBe(9)
    // Tomorrow morning: 23:00 is on the late side of a window that wraps.
    expect(held.getDate()).toBe(16)
  })

  it('releases the same morning when the hold began after midnight', () => {
    const held = afterQuietHours(at(2))
    expect(held.getHours()).toBe(9)
    expect(held.getDate()).toBe(15)
  })

  it('leaves an instant outside the window exactly where it is', () => {
    const noon = at(12)
    expect(afterQuietHours(noon)).toBe(noon)
  })
})

describe('the consent cadence', () => {
  it('caps a chase before it becomes harassment', () => {
    expect(CONSENT_CADENCE.maxAttempts).toBe(3)
    expect(CONSENT_CADENCE.resendAfterDays).toBe(7)
  })

  /*
   * That `chase-rules.ts` re-exports this object rather than holding a second
   * copy is asserted in `src/features/kyc/chase-rules.test.ts`, not here: the
   * layer rule forbids `src/domain` importing a feature, and a test is not an
   * exemption from it. The assertion belongs on the side that does the importing.
   */
})
