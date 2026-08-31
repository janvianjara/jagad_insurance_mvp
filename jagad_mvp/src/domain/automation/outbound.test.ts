import { describe, expect, it } from 'vitest'

import { CONSENTED_STATE, OUTBOUND_HOLDS, checkOutbound } from './outbound'

/** Local time: quiet hours are a fact about the person receiving the message. */
const at = (hour: number) => new Date(2026, 8, 15, hour, 0, 0)

const input = (over: Partial<Parameters<typeof checkOutbound>[0]> = {}) =>
  checkOutbound({
    consentState: CONSENTED_STATE,
    at: at(11),
    recipeKey: 'renewal.reminder',
    ...over,
  })

describe('consent — FR-17.3', () => {
  it('lets a message be prepared for somebody who answered the link', () => {
    expect(input().ok).toBe(true)
  })

  it('refuses every state that is not a yes, and names which one it found', () => {
    for (const state of ['not_sent', 'link_issued', 'expired']) {
      const decision = input({ consentState: state })
      expect(decision.ok).toBe(false)
      if (decision.ok) return
      expect(decision.hold).toBe(OUTBOUND_HOLDS.consent)
      expect(decision.reason).toContain(`"${state}"`)
    }
  })

  it('prepares NOTHING when consent is missing, rather than staging it for review', () => {
    const decision = input({ consentState: 'expired' })
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    // The distinction the whole module turns on. A row a person can see is a row
    // a person can release, and consent withdrawn means there is no decision to
    // put in front of anybody.
    expect(decision.stage).toBe(false)
    expect(decision.releaseAfter).toBeNull()
  })

  it('is checked before the clock, so nobody is sent to fix the wrong thing', () => {
    const decision = input({ consentState: 'not_sent', at: at(23) })
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.hold).toBe(OUTBOUND_HOLDS.consent)
  })
})

describe('quiet hours', () => {
  it('holds a message prepared at eleven at night', () => {
    const decision = input({ at: at(23) })
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.hold).toBe(OUTBOUND_HOLDS.quietHours)
    expect(decision.reason).toMatch(/quiet hours/)
  })

  it('holds it rather than dropping it, and stamps when it may go', () => {
    const decision = input({ at: at(2) })
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.stage).toBe(true)
    expect(decision.releaseAfter).not.toBeNull()
    expect(new Date(String(decision.releaseAfter)).getHours()).toBe(9)
  })

  it('does not hold anything during the working day', () => {
    expect(input({ at: at(9) }).ok).toBe(true)
    expect(input({ at: at(20) }).ok).toBe(true)
  })

  it('takes the window as an argument, so a test can sit either side of it', () => {
    expect(input({ at: at(13), quietHours: [12, 14] }).ok).toBe(false)
    expect(input({ at: at(13), quietHours: [] }).ok).toBe(true)
  })
})
