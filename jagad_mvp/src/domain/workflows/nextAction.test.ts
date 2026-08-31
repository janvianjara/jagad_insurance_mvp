import { describe, expect, it } from 'vitest'
import { MAX_NEXT_ACTION_DAYS, nextActionOverdue, nextActionSatisfied } from './nextAction'
import type { DispositionRule, NextActionContext } from './nextAction'
import { reasonOf } from './machine'

const NOW = new Date('2026-08-26T12:00:00.000Z')
const TOMORROW = '2026-08-27T10:00:00.000Z'

function disposition(overrides: Partial<DispositionRule> = {}): DispositionRule {
  return {
    key: 'call_back',
    label: 'Connected — call back',
    terminal: false,
    requiresNextAction: true,
    requiresReason: false,
    ...overrides,
  }
}

function context(overrides: Partial<NextActionContext> = {}): NextActionContext {
  return {
    now: NOW,
    disposition: disposition(),
    nextAction: { kind: 'inquiry_follow_up', dueAt: TOMORROW },
    ...overrides,
  }
}

describe('the next-action mandate — FR-06.15', () => {
  it('allows a contact that says what happens next and when', () => {
    expect(nextActionSatisfied(context()).ok).toBe(true)
  })

  it('refuses an outcome nobody chose, because a note is not a reportable fact', () => {
    const verdict = nextActionSatisfied(context({ disposition: null }))
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toMatch(/Choose what came of this contact/)
  })

  it('refuses to leave an open inquiry without a next action, and says why it matters', () => {
    const verdict = nextActionSatisfied(context({ nextAction: null }))
    expect(verdict.ok).toBe(false)
    // The sentence names the disposition, so the person reads it as being about
    // the choice they just made rather than about the form in general.
    expect(reasonOf(verdict)).toMatch(/Connected — call back/)
    expect(reasonOf(verdict)).toMatch(/how a lead goes quiet and nobody notices/)
  })

  it('asks nothing further of an outcome that closes the inquiry', () => {
    const verdict = nextActionSatisfied(
      context({
        disposition: disposition({ key: 'not_interested', terminal: true, requiresReason: true }),
        nextAction: null,
        reason: 'Bought elsewhere on a corporate scheme.',
      }),
    )
    expect(verdict.ok).toBe(true)
  })

  it('holds FR-06.10 open here too: a closing outcome needs its reason', () => {
    const verdict = nextActionSatisfied(
      context({
        disposition: disposition({ key: 'not_interested', terminal: true, requiresReason: true }),
        nextAction: null,
        reason: '   ',
      }),
    )
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toMatch(/reason is compulsory/)
  })

  it('refuses a date already gone, because nothing would ever surface it', () => {
    const verdict = nextActionSatisfied(
      context({ nextAction: { kind: 'inquiry_follow_up', dueAt: '2026-08-25T10:00:00.000Z' } }),
    )
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toMatch(/dated in the past/)
  })

  it('refuses the mistyped year that would hide a lead from every ageing report', () => {
    const verdict = nextActionSatisfied(
      context({ nextAction: { kind: 'inquiry_follow_up', dueAt: '2029-08-27T10:00:00.000Z' } }),
    )
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toMatch(new RegExp(`${MAX_NEXT_ACTION_DAYS} days`))
  })

  it('refuses a date it cannot read rather than treating it as absent', () => {
    const verdict = nextActionSatisfied(
      context({ nextAction: { kind: 'inquiry_follow_up', dueAt: 'thursday-ish' } }),
    )
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toMatch(/could not be read/)
  })

  it('wants to know what the next action is, not only when', () => {
    const verdict = nextActionSatisfied(
      context({ nextAction: { kind: '  ', dueAt: TOMORROW } }),
    )
    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toMatch(/what the next action is/)
  })

  it('leaves a disposition that asks for nothing alone', () => {
    const verdict = nextActionSatisfied(
      context({ disposition: disposition({ requiresNextAction: false }), nextAction: null }),
    )
    expect(verdict.ok).toBe(true)
  })
})

describe('reading the obligation back — the KPI arithmetic', () => {
  it('counts a date already passed as overdue', () => {
    expect(nextActionOverdue('2026-08-26T11:00:00.000Z', NOW)).toBe(true)
  })

  it('does not count one still to come', () => {
    expect(nextActionOverdue(TOMORROW, NOW)).toBe(false)
  })

  /**
   * The distinction the KPI turns on. "No next action at all" is not overdue —
   * it is worse, and it is counted by the coverage measure rather than by this
   * one. Conflating the two would let an inquiry nobody has planned anything for
   * disappear from both numbers.
   */
  it('treats no next action as a different fault from a late one', () => {
    expect(nextActionOverdue(null, NOW)).toBe(false)
  })
})
