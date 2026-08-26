import { describe, expect, it } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import { money } from '../money'
import { reasonOf } from './machine'
import { PREMIUM_SOURCES } from './quotation'
import {
  KYC_STATES,
  POLICY_ENTRY_PATHS,
  POLICY_STATES,
  canHardDeletePolicy,
  directEntryPath,
  finalPremiumPresentAndTyped,
  kycComplete,
  policyMachine,
  retentionWindowElapsed,
  retentionYearsFor,
} from './policy'
import type { PolicyContext } from './policy'

const NOW = new Date('2026-08-26T09:00:00.000Z')

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => NOW })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

function context(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    now: NOW,
    entryPath: POLICY_ENTRY_PATHS.proposal,
    kycState: KYC_STATES.complete,
    finalPremium: money(28_450),
    finalPremiumSource: PREMIUM_SOURCES.typed,
    retentionClass: 'policy',
    retentionYearsByClass: { policy: 10, correspondence: 3 },
    ...overrides,
  }
}

describe('policy issue gate', () => {
  it('gates issue on KYC complete and a non-empty Final Premium', () => {
    expect(policyMachine.canTransition(POLICY_STATES.sent, POLICY_STATES.issued, context()).ok).toBe(true)

    const kycPending = policyMachine.canTransition(
      POLICY_STATES.sent,
      POLICY_STATES.issued,
      context({ kycState: KYC_STATES.partial }),
    )
    const noPremium = policyMachine.canTransition(
      POLICY_STATES.sent,
      POLICY_STATES.issued,
      context({ finalPremium: undefined }),
    )

    expect(kycPending.ok).toBe(false)
    expect(kycPending.ok === false && kycPending.guard).toBe('kycComplete')
    expect(noPremium.ok).toBe(false)
    expect(noPremium.ok === false && noPremium.guard).toBe('finalPremiumPresentAndTyped')
  })

  it('leaves the premium components optional, checking only the final figure', () => {
    const noComponents = context({ netPremium: undefined, gstAmount: undefined })

    expect(finalPremiumPresentAndTyped(noComponents).ok).toBe(true)
    expect(policyMachine.canTransition(POLICY_STATES.sent, POLICY_STATES.issued, noComponents).ok).toBe(true)
  })

  it('refuses a Final Premium the platform computed rather than a person typed', () => {
    const verdict = finalPremiumPresentAndTyped(context({ finalPremiumSource: PREMIUM_SOURCES.computed }))

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('typed')
  })

  it('says what is missing when the premium is empty', () => {
    expect(reasonOf(finalPremiumPresentAndTyped(context({ finalPremium: undefined })))).toContain(
      'does not calculate',
    )
    expect(kycComplete(context({ kycState: KYC_STATES.pending })).ok).toBe(false)
  })

  it('emits policy.issued once both gates pass', () => {
    const { bus, seen } = recordingBus()
    const outcome = policyMachine.transition(POLICY_STATES.sent, POLICY_STATES.issued, context(), { bus })

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['policy.issued'])
  })
})

describe('policy direct entry', () => {
  it('lets the direct-entry path skip proposal', () => {
    const direct = context({ entryPath: POLICY_ENTRY_PATHS.direct })

    expect(directEntryPath(direct).ok).toBe(true)
    expect(policyMachine.canTransition(POLICY_STATES.draft, POLICY_STATES.issued, direct).ok).toBe(true)
  })

  it('keeps a proposal-path policy on the proposal route', () => {
    const proposalPathPolicy = context()

    const skipped = policyMachine.canTransition(POLICY_STATES.draft, POLICY_STATES.issued, proposalPathPolicy)
    expect(skipped.ok).toBe(false)
    expect(reasonOf(skipped)).toContain('proposal')
    expect(policyMachine.canTransition(POLICY_STATES.draft, POLICY_STATES.proposal, proposalPathPolicy).ok).toBe(true)
  })

  it('still gates a direct-entry issue on KYC and the Final Premium', () => {
    const direct = context({ entryPath: POLICY_ENTRY_PATHS.direct, kycState: KYC_STATES.partial })
    expect(policyMachine.canTransition(POLICY_STATES.draft, POLICY_STATES.issued, direct).ok).toBe(false)
  })
})

describe('policy retention', () => {
  it('locks a closed policy past its retention class, and never hard-deletes it', () => {
    const insideWindow = context({ closedAt: '2020-01-01T00:00:00.000Z' })
    const pastWindow = context({ closedAt: '2010-01-01T00:00:00.000Z' })

    expect(retentionWindowElapsed(insideWindow).ok).toBe(false)
    expect(reasonOf(retentionWindowElapsed(insideWindow))).toContain('10-year retention window')
    expect(retentionWindowElapsed(pastWindow).ok).toBe(true)
    expect(policyMachine.canTransition(POLICY_STATES.closed, POLICY_STATES.locked, pastWindow).ok).toBe(true)

    const deletion = canHardDeletePolicy()
    expect(deletion.ok).toBe(false)
    expect(reasonOf(deletion)).toContain('never deleted')
  })

  it('takes the retention period from the class, not from a constant in code', () => {
    expect(retentionYearsFor(context())).toBe(10)
    expect(retentionYearsFor(context({ retentionClass: 'correspondence' }))).toBe(3)

    const unconfigured = retentionWindowElapsed(
      context({ closedAt: '2010-01-01T00:00:00.000Z', retentionClass: 'unknown-class' }),
    )
    expect(unconfigured.ok).toBe(false)
    expect(reasonOf(unconfigured)).toContain('not from a constant')
  })

  it('offers no path out of locked, in either direction', () => {
    expect(policyMachine.isTerminal(POLICY_STATES.locked)).toBe(true)
    expect(Object.values(policyMachine.transitions).every((targets) => !('deleted' in (targets ?? {})))).toBe(true)
  })
})
