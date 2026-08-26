/**
 * Premium schedule - plan §9, decision D-A, prototype r_instal / r_grace, P2.
 *
 *   created (mode + instalment amount typed from insurer) -> active -> completed | superseded
 *
 * Two §9 bullets start here and are reused by the instalment machine: the
 * instalment amount is typed and never derived from the annual premium, and the
 * grace days come from the schedule's mode rather than from a constant. Monthly
 * is commonly fifteen days against thirty on annual, and motor is commonly zero -
 * three different numbers, which is exactly why none of them lives in code.
 */

import { isMoney } from '../money'
import type { Money } from '../money'
import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'

export const SCHEDULE_STATES = {
  created: 'created',
  active: 'active',
  completed: 'completed',
  superseded: 'superseded',
} as const

export type ScheduleState = (typeof SCHEDULE_STATES)[keyof typeof SCHEDULE_STATES]

export const PREMIUM_MODES = {
  single: 'single',
  annual: 'annual',
  halfYearly: 'half_yearly',
  quarterly: 'quarterly',
  monthly: 'monthly',
} as const

export type PremiumMode = (typeof PREMIUM_MODES)[keyof typeof PREMIUM_MODES]

/**
 * Where the instalment figure came from. `derived_from_annual` exists so a
 * repository can honestly record what it was handed and be refused for it.
 */
export const INSTALMENT_AMOUNT_SOURCES = {
  typedFromInsurer: 'typed_from_insurer',
  derivedFromAnnual: 'derived_from_annual',
} as const

export type InstalmentAmountSource =
  (typeof INSTALMENT_AMOUNT_SOURCES)[keyof typeof INSTALMENT_AMOUNT_SOURCES]

/** The shared shape the amount guard needs. Both this machine and the instalment machine carry it. */
export type TypedInstalmentAmount = {
  readonly instalmentAmount?: Money
  readonly instalmentAmountSource?: InstalmentAmountSource
  /** Present for context only. Nothing in this file reads it to produce a figure. */
  readonly annualPremium?: Money
}

/** Grace days per mode, from the product and schedule configuration. */
export type GraceDaysByMode = Readonly<Partial<Record<PremiumMode, number>>>

export type ScheduleContext = TypedInstalmentAmount & {
  readonly mode?: PremiumMode
  readonly graceDaysByMode?: GraceDaysByMode
  readonly instalmentCount?: number
  readonly settledInstalmentCount?: number
  readonly supersededByScheduleId?: string
}

/**
 * §9: "Grace days come from the schedule's mode, not from a constant." Returns
 * undefined rather than a fallback, so a missing configuration surfaces as a
 * refusal a person can act on instead of as somebody's guessed default.
 */
export function graceDaysFor(mode: PremiumMode, graceDaysByMode: GraceDaysByMode): number | undefined {
  const days = graceDaysByMode[mode]
  return typeof days === 'number' && Number.isFinite(days) && days >= 0 ? days : undefined
}

/**
 * §9: "The instalment amount is typed, never derived from the annual premium."
 * There is deliberately no function anywhere in this module that divides an
 * annual figure by a mode - the refusal below is the whole implementation.
 */
export function instalmentAmountTypedNotDerived(ctx: TypedInstalmentAmount): TransitionResult {
  if (!isMoney(ctx.instalmentAmount)) {
    return refuse(
      'Type the instalment amount from the insurer schedule. The platform will not work it out from the annual premium.',
    )
  }
  if (ctx.instalmentAmountSource === INSTALMENT_AMOUNT_SOURCES.derivedFromAnnual) {
    return refuse(
      'This instalment amount is marked as derived from the annual premium. Instalment figures are typed from the insurer - loadings and mode charges mean the division never comes out right.',
    )
  }
  return allow()
}

export function scheduleModeHasGraceDays(ctx: ScheduleContext): TransitionResult {
  if (!ctx.mode) {
    return refuse('Pick the premium mode before activating the schedule.')
  }
  if (!ctx.graceDaysByMode) {
    return refuse('No grace configuration was supplied for this schedule.')
  }
  if (graceDaysFor(ctx.mode, ctx.graceDaysByMode) === undefined) {
    return refuse(
      `No grace period is configured for ${ctx.mode} mode. Grace days come from the schedule's mode, so an unconfigured mode cannot be activated.`,
    )
  }
  return allow()
}

export function everyInstalmentSettled(ctx: ScheduleContext): TransitionResult {
  if (typeof ctx.instalmentCount !== 'number' || ctx.instalmentCount < 1) {
    return refuse('This schedule has no instalments on it.')
  }
  const settled = ctx.settledInstalmentCount ?? 0
  if (settled < ctx.instalmentCount) {
    return refuse(
      `${ctx.instalmentCount - settled} of ${ctx.instalmentCount} instalments are still open, so the schedule is not complete.`,
    )
  }
  return allow()
}

export function supersededByAnotherSchedule(ctx: ScheduleContext): TransitionResult {
  if (!ctx.supersededByScheduleId) {
    return refuse('A schedule is superseded by the schedule that replaces it. Name the replacement.')
  }
  return allow()
}

export const SCHEDULE_TRANSITIONS = {
  created: {
    active: {
      event: 'schedule.activated',
      guards: [instalmentAmountTypedNotDerived, scheduleModeHasGraceDays],
    },
  },
  active: {
    completed: { event: 'schedule.completed', guards: [everyInstalmentSettled] },
    superseded: { event: 'schedule.superseded', guards: [supersededByAnotherSchedule] },
  },
} as const satisfies TransitionTable<ScheduleState, ScheduleContext>

export const premiumScheduleMachine = createMachine<ScheduleState, ScheduleContext>({
  name: 'premiumSchedule',
  states: Object.values(SCHEDULE_STATES),
  initial: SCHEDULE_STATES.created,
  transitions: SCHEDULE_TRANSITIONS,
})
