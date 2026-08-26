import { describe, expect, it } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import { money } from '../money'
import { reasonOf } from './machine'
import { INSTALMENT_AMOUNT_SOURCES, PREMIUM_MODES } from './premiumSchedule'
import type { GraceDaysByMode } from './premiumSchedule'
import {
  DUE_ITEM_KINDS,
  INSTALMENT_STATES,
  PAYMENT_CHANNELS,
  POLICY_STANDINGS,
  continuityAtRisk,
  dueItemKind,
  graceDaysComeFromScheduleMode,
  graceEndsAt,
  instalmentMachine,
  paymentChannelRecorded,
  policyStandingFor,
} from './instalment'
import type { InstalmentContext } from './instalment'

const NOW = new Date('2026-08-26T09:00:00.000Z')
const HEALTH_GRACE: GraceDaysByMode = { monthly: 15, annual: 30 }
const MOTOR_GRACE: GraceDaysByMode = { annual: 0 }

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => NOW })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

function context(overrides: Partial<InstalmentContext> = {}): InstalmentContext {
  return {
    now: NOW,
    dueDate: '2026-08-20T00:00:00.000Z',
    mode: PREMIUM_MODES.monthly,
    graceDaysByMode: HEALTH_GRACE,
    instalmentAmount: money(2_480),
    instalmentAmountSource: INSTALMENT_AMOUNT_SOURCES.typedFromInsurer,
    annualPremium: money(28_450),
    paymentChannel: PAYMENT_CHANNELS.mandateDebit,
    paymentReference: 'NACH-DR-99120',
    ...overrides,
  }
}

describe('instalment payment', () => {
  it('records the amount typed on the schedule and never derives it from the annual premium', () => {
    expect(instalmentMachine.canTransition(INSTALMENT_STATES.due, INSTALMENT_STATES.paid, context()).ok).toBe(true)

    const derived = instalmentMachine.canTransition(
      INSTALMENT_STATES.due,
      INSTALMENT_STATES.paid,
      context({ instalmentAmountSource: INSTALMENT_AMOUNT_SOURCES.derivedFromAnnual }),
    )

    expect(derived.ok).toBe(false)
    expect(derived.ok === false && derived.guard).toBe('instalmentAmountTypedNotDerived')
  })

  it('records which of the three channels settled it, and the reference', () => {
    expect(paymentChannelRecorded(context()).ok).toBe(true)
    expect(paymentChannelRecorded(context({ paymentChannel: undefined })).ok).toBe(false)
    expect(paymentChannelRecorded(context({ paymentReference: '' })).ok).toBe(false)

    for (const channel of Object.values(PAYMENT_CHANNELS)) {
      expect(paymentChannelRecorded(context({ paymentChannel: channel })).ok).toBe(true)
    }
  })
})

describe('instalment grace', () => {
  it('takes the grace days from the schedule mode, not from a constant', () => {
    expect(graceEndsAt('2026-08-20T00:00:00.000Z', 15).toISOString().slice(0, 10)).toBe('2026-09-04')
    expect(graceEndsAt('2026-08-20T00:00:00.000Z', 30).toISOString().slice(0, 10)).toBe('2026-09-19')

    expect(graceDaysComeFromScheduleMode(context()).ok).toBe(true)

    const unconfigured = graceDaysComeFromScheduleMode(
      context({ mode: PREMIUM_MODES.monthly, graceDaysByMode: MOTOR_GRACE }),
    )
    expect(unconfigured.ok).toBe(false)
    expect(reasonOf(unconfigured)).toContain('never from a constant in code')
  })

  it('gives a motor policy zero grace and a monthly health policy fifteen days', () => {
    const motorMissed = context({
      mode: PREMIUM_MODES.annual,
      graceDaysByMode: MOTOR_GRACE,
      dueDate: '2026-08-25T00:00:00.000Z',
    })
    const healthMissed = context({ dueDate: '2026-08-25T00:00:00.000Z' })

    expect(instalmentMachine.canTransition(INSTALMENT_STATES.missed, INSTALMENT_STATES.inGrace, motorMissed).ok).toBe(false)
    expect(instalmentMachine.canTransition(INSTALMENT_STATES.missed, INSTALMENT_STATES.inGrace, healthMissed).ok).toBe(true)
  })

  it('expires the grace window and puts the policy at risk once it closes', () => {
    const { bus, seen } = recordingBus()
    const pastGrace = context({ dueDate: '2026-07-01T00:00:00.000Z' })

    expect(instalmentMachine.canTransition(INSTALMENT_STATES.inGrace, INSTALMENT_STATES.paidInGrace, pastGrace).ok).toBe(false)

    const expired = instalmentMachine.transition(
      INSTALMENT_STATES.inGrace,
      INSTALMENT_STATES.graceExpired,
      pastGrace,
      { bus },
    )
    expect(expired.ok).toBe(true)

    const lapsed = instalmentMachine.transition(INSTALMENT_STATES.graceExpired, INSTALMENT_STATES.lapsed, pastGrace, { bus })
    expect(lapsed.ok).toBe(true)
    expect(seen.map((event) => event.name)).toContain('policy.lapsed')
  })

  it('returns a paid-in-grace instalment to the schedule', () => {
    const { bus, seen } = recordingBus()
    const paid = instalmentMachine.transition(
      INSTALMENT_STATES.inGrace,
      INSTALMENT_STATES.paidInGrace,
      context(),
      { bus },
    )
    expect(paid.ok).toBe(true)

    const resumed = instalmentMachine.transition(
      INSTALMENT_STATES.paidInGrace,
      INSTALMENT_STATES.scheduled,
      context(),
      { bus },
    )
    expect(resumed.ok).toBe(true)
    expect(seen.map((event) => event.name)).toContain('instalment.resumed')
  })
})

describe('an instalment due date is not a renewal date', () => {
  it('classifies a mid-term instalment and a policy expiry as different kinds of item', () => {
    const instalment = { policyId: 'pol-1', dueDate: '2026-09-20T00:00:00.000Z', isPolicyExpiry: false }
    const renewal = { policyId: 'pol-1', dueDate: '2026-09-20T00:00:00.000Z', isPolicyExpiry: true }

    expect(dueItemKind(instalment)).toBe(DUE_ITEM_KINDS.instalment)
    expect(dueItemKind(renewal)).toBe(DUE_ITEM_KINDS.renewal)
    expect(dueItemKind(instalment)).not.toBe(dueItemKind(renewal))
  })

  it('leaves a policy with a due instalment in force, not expiring', () => {
    const instalment = { policyId: 'pol-1', dueDate: '2026-09-20T00:00:00.000Z', isPolicyExpiry: false }
    const renewal = { policyId: 'pol-2', dueDate: '2026-09-20T00:00:00.000Z', isPolicyExpiry: true }

    expect(policyStandingFor(instalment)).toBe(POLICY_STANDINGS.inForce)
    expect(policyStandingFor(renewal)).toBe(POLICY_STANDINGS.expiring)
  })
})

describe('what a missed instalment puts at risk', () => {
  it('names continuity, not only the amount', () => {
    expect(continuityAtRisk()).toEqual(['sum_insured', 'no_claim_bonus', 'waiting_periods_served'])
  })

  it('sends a customer message on the miss and again on entering grace', () => {
    expect(instalmentMachine.transitions.due?.missed?.alsoEmits).toContain('message.sent')
    expect(instalmentMachine.transitions.missed?.in_grace?.alsoEmits).toContain('message.sent')
  })
})
