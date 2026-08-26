import { describe, expect, it } from 'vitest'
import { createEventBus } from '../events'
import type { DomainEvent } from '../events'
import { isMoney, money } from '../money'
import { reasonOf } from './machine'
import {
  INSTALMENT_AMOUNT_SOURCES,
  PREMIUM_MODES,
  SCHEDULE_STATES,
  graceDaysFor,
  instalmentAmountTypedNotDerived,
  premiumScheduleMachine,
  scheduleModeHasGraceDays,
} from './premiumSchedule'
import type { GraceDaysByMode, ScheduleContext } from './premiumSchedule'

/** The prototype r_grace figures: monthly 15, annual 30, motor 0. */
const HEALTH_GRACE: GraceDaysByMode = { monthly: 15, quarterly: 15, half_yearly: 30, annual: 30, single: 0 }
const MOTOR_GRACE: GraceDaysByMode = { annual: 0, single: 0 }

function recordingBus() {
  const seen: DomainEvent[] = []
  const bus = createEventBus({ now: () => new Date('2026-08-26T09:00:00.000Z') })
  bus.onAny((event) => seen.push(event))
  return { bus, seen }
}

function context(overrides: Partial<ScheduleContext> = {}): ScheduleContext {
  return {
    mode: PREMIUM_MODES.monthly,
    instalmentAmount: money(2_480),
    instalmentAmountSource: INSTALMENT_AMOUNT_SOURCES.typedFromInsurer,
    annualPremium: money(28_450),
    graceDaysByMode: HEALTH_GRACE,
    instalmentCount: 12,
    settledInstalmentCount: 12,
    ...overrides,
  }
}

describe('instalment amount', () => {
  it('is never derived from the annual premium', () => {
    expect(instalmentAmountTypedNotDerived(context()).ok).toBe(true)

    const derived = instalmentAmountTypedNotDerived(
      context({ instalmentAmountSource: INSTALMENT_AMOUNT_SOURCES.derivedFromAnnual }),
    )
    expect(derived.ok).toBe(false)
    expect(reasonOf(derived)).toContain('typed from the insurer')

    const empty = instalmentAmountTypedNotDerived(context({ instalmentAmount: undefined }))
    expect(empty.ok).toBe(false)
    expect(reasonOf(empty)).toContain('will not work it out from the annual premium')
  })

  it('does not offer a way to turn an annual premium into an instalment figure', async () => {
    const scheduleModule: Record<string, unknown> = await import('./premiumSchedule')

    // Nothing this module exports produces an amount, even handed a schedule that
    // holds the annual premium. Record-only is the absence of the function, not a
    // comment asking people not to call it.
    const amountProducers = Object.entries(scheduleModule)
      .filter(([, value]) => typeof value === 'function')
      .filter(([, value]) => {
        try {
          return isMoney((value as (input: unknown) => unknown)(context()))
        } catch {
          return false
        }
      })
      .map(([name]) => name)

    expect(amountProducers).toEqual([])
  })

  it('blocks activation of a schedule whose instalment figure was worked out rather than typed', () => {
    const verdict = premiumScheduleMachine.canTransition(
      SCHEDULE_STATES.created,
      SCHEDULE_STATES.active,
      context({ instalmentAmountSource: INSTALMENT_AMOUNT_SOURCES.derivedFromAnnual }),
    )

    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.guard).toBe('instalmentAmountTypedNotDerived')
  })
})

describe('grace days', () => {
  it('come from the schedule mode, not from a constant', () => {
    expect(graceDaysFor(PREMIUM_MODES.monthly, HEALTH_GRACE)).toBe(15)
    expect(graceDaysFor(PREMIUM_MODES.annual, HEALTH_GRACE)).toBe(30)
    expect(graceDaysFor(PREMIUM_MODES.annual, MOTOR_GRACE)).toBe(0)
  })

  it('treats zero grace as a real answer rather than a missing one', () => {
    expect(graceDaysFor(PREMIUM_MODES.annual, MOTOR_GRACE)).toBe(0)
    expect(scheduleModeHasGraceDays(context({ mode: PREMIUM_MODES.annual, graceDaysByMode: MOTOR_GRACE })).ok).toBe(true)
  })

  it('refuses to activate a mode nobody configured grace for', () => {
    const verdict = scheduleModeHasGraceDays(
      context({ mode: PREMIUM_MODES.monthly, graceDaysByMode: MOTOR_GRACE }),
    )

    expect(verdict.ok).toBe(false)
    expect(reasonOf(verdict)).toContain('No grace period is configured for monthly')
    expect(graceDaysFor(PREMIUM_MODES.monthly, MOTOR_GRACE)).toBeUndefined()
  })
})

describe('schedule lifecycle', () => {
  it('activates once the amount is typed and the mode has grace configured', () => {
    const { bus, seen } = recordingBus()
    const outcome = premiumScheduleMachine.transition(
      SCHEDULE_STATES.created,
      SCHEDULE_STATES.active,
      context(),
      { bus },
    )

    expect(outcome.ok).toBe(true)
    expect(seen.map((event) => event.name)).toEqual(['schedule.activated'])
  })

  it('completes only when every instalment is settled', () => {
    expect(premiumScheduleMachine.canTransition(SCHEDULE_STATES.active, SCHEDULE_STATES.completed, context()).ok).toBe(true)

    const open = premiumScheduleMachine.canTransition(
      SCHEDULE_STATES.active,
      SCHEDULE_STATES.completed,
      context({ settledInstalmentCount: 9 }),
    )
    expect(open.ok).toBe(false)
    expect(reasonOf(open)).toContain('3 of 12')
  })

  it('is superseded only by a named replacement schedule', () => {
    expect(premiumScheduleMachine.canTransition(SCHEDULE_STATES.active, SCHEDULE_STATES.superseded, context()).ok).toBe(false)
    expect(
      premiumScheduleMachine.canTransition(
        SCHEDULE_STATES.active,
        SCHEDULE_STATES.superseded,
        context({ supersededByScheduleId: 'sch-2' }),
      ).ok,
    ).toBe(true)
  })
})
