/**
 * Instalment - plan §9, decision D-A, prototype r_instal / r_grace, P2.
 *
 *   scheduled -> due -+- paid (mandate debit | collection | direct reference)
 *                     +- missed -> in_grace -+- paid_in_grace -> back to schedule
 *                                            +- grace_expired -> policy at risk -> lapsed
 *
 * §9 asks for three things here and the third is the one that gets missed: an
 * instalment due date is not a renewal date. A policy with a due instalment is in
 * force and is not expiring, so the renewals queue must show the two as visibly
 * different kinds of item. And what is at risk on a missed instalment is
 * continuity - sum insured, No Claim Bonus, waiting periods already served - so
 * that list belongs in the customer message, not just the amount.
 */

import { graceDaysFor, instalmentAmountTypedNotDerived } from './premiumSchedule'
import type { GraceDaysByMode, PremiumMode, TypedInstalmentAmount } from './premiumSchedule'
import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'

export const INSTALMENT_STATES = {
  scheduled: 'scheduled',
  due: 'due',
  paid: 'paid',
  missed: 'missed',
  inGrace: 'in_grace',
  paidInGrace: 'paid_in_grace',
  graceExpired: 'grace_expired',
  lapsed: 'lapsed',
} as const

export type InstalmentState = (typeof INSTALMENT_STATES)[keyof typeof INSTALMENT_STATES]

/** The three ways an instalment can be settled. All of them are records of something that happened. */
export const PAYMENT_CHANNELS = {
  mandateDebit: 'mandate_debit',
  collection: 'collection',
  directReference: 'direct_reference',
} as const

export type PaymentChannel = (typeof PAYMENT_CHANNELS)[keyof typeof PAYMENT_CHANNELS]

export type InstalmentContext = TypedInstalmentAmount & {
  readonly now: Date
  readonly dueDate?: string
  readonly mode?: PremiumMode
  readonly graceDaysByMode?: GraceDaysByMode
  readonly paymentChannel?: PaymentChannel
  readonly paymentReference?: string
  readonly paidAt?: string
}

/** Where the grace window ends for this instalment. Pure, so a screen can count it down. */
export function graceEndsAt(dueDate: string, graceDays: number): Date {
  return new Date(new Date(dueDate).getTime() + graceDays * 86_400_000)
}

function graceWindow(ctx: InstalmentContext): { ok: false; reason: string } | { ok: true; endsAt: Date; days: number } {
  if (!ctx.dueDate) return { ok: false, reason: 'This instalment has no due date.' }
  if (!ctx.mode) return { ok: false, reason: 'This instalment has no premium mode, so its grace period is unknown.' }
  if (!ctx.graceDaysByMode) {
    return { ok: false, reason: 'No grace configuration was supplied with this instalment.' }
  }
  const days = graceDaysFor(ctx.mode, ctx.graceDaysByMode)
  if (days === undefined) {
    return {
      ok: false,
      reason: `No grace period is configured for ${ctx.mode} mode. Grace days come from the schedule's mode, never from a constant in code.`,
    }
  }
  return { ok: true, endsAt: graceEndsAt(ctx.dueDate, days), days }
}

/** §9: grace days come from the schedule's mode. Zero is a legitimate answer, and motor uses it. */
export function graceDaysComeFromScheduleMode(ctx: InstalmentContext): TransitionResult {
  const window = graceWindow(ctx)
  return window.ok ? allow() : refuse(window.reason)
}

export function gracePeriodStillOpen(ctx: InstalmentContext): TransitionResult {
  const window = graceWindow(ctx)
  if (!window.ok) return refuse(window.reason)
  if (ctx.now > window.endsAt) {
    return refuse(
      `The ${window.days}-day grace period closed on ${window.endsAt.toISOString().slice(0, 10)}. This instalment is past grace.`,
    )
  }
  return allow()
}

export function graceWindowHasExpired(ctx: InstalmentContext): TransitionResult {
  const window = graceWindow(ctx)
  if (!window.ok) return refuse(window.reason)
  if (ctx.now <= window.endsAt) {
    return refuse(
      `The ${window.days}-day grace period runs until ${window.endsAt.toISOString().slice(0, 10)}. The policy is still in force.`,
    )
  }
  return allow()
}

export function instalmentIsDue(ctx: InstalmentContext): TransitionResult {
  if (!ctx.dueDate) return refuse('This instalment has no due date.')
  if (ctx.now < new Date(ctx.dueDate)) {
    return refuse(`This instalment is not due until ${ctx.dueDate.slice(0, 10)}.`)
  }
  return allow()
}

/** A payment is recorded through one of three channels, and it names the record it came from. */
export function paymentChannelRecorded(ctx: InstalmentContext): TransitionResult {
  if (!ctx.paymentChannel) {
    return refuse('Record how this instalment was paid: a mandate debit, a collection, or a direct reference.')
  }
  if (!ctx.paymentReference || ctx.paymentReference.trim().length === 0) {
    return refuse('Record the reference for this payment - the debit id, the collection number or the bank reference.')
  }
  return allow()
}

/** The two kinds of item the renewals queue holds, and §9 insists they look different. */
export const DUE_ITEM_KINDS = { instalment: 'instalment', renewal: 'renewal' } as const
export type DueItemKind = (typeof DUE_ITEM_KINDS)[keyof typeof DUE_ITEM_KINDS]

export type DueItem = {
  readonly policyId: string
  readonly dueDate: string
  /** True when this date is the policy's own expiry rather than an instalment inside the term. */
  readonly isPolicyExpiry: boolean
}

/**
 * §9: "An instalment due date is not a renewal date." Same-looking date, entirely
 * different conversation with the customer: one is "your next instalment", the
 * other is "your cover ends".
 */
export function dueItemKind(item: DueItem): DueItemKind {
  return item.isPolicyExpiry ? DUE_ITEM_KINDS.renewal : DUE_ITEM_KINDS.instalment
}

export const POLICY_STANDINGS = { inForce: 'in_force', expiring: 'expiring' } as const
export type PolicyStanding = (typeof POLICY_STANDINGS)[keyof typeof POLICY_STANDINGS]

/** A policy with a due instalment is in force. It is not expiring, and it must not be listed as if it were. */
export function policyStandingFor(item: DueItem): PolicyStanding {
  return dueItemKind(item) === DUE_ITEM_KINDS.renewal ? POLICY_STANDINGS.expiring : POLICY_STANDINGS.inForce
}

/**
 * §9: "What is at risk on a missed instalment is continuity - sum insured, No
 * Claim Bonus, waiting periods already served. That is the real cost and it
 * belongs in the customer message, not just the amount."
 */
export const CONTINUITY_AT_RISK = [
  'sum_insured',
  'no_claim_bonus',
  'waiting_periods_served',
] as const

export type ContinuityAtRisk = (typeof CONTINUITY_AT_RISK)[number]

export function continuityAtRisk(): readonly ContinuityAtRisk[] {
  return CONTINUITY_AT_RISK
}

export const INSTALMENT_TRANSITIONS = {
  scheduled: {
    due: { event: 'instalment.due', guards: [instalmentIsDue] },
  },
  due: {
    paid: {
      event: 'instalment.paid',
      guards: [instalmentAmountTypedNotDerived, paymentChannelRecorded],
    },
    missed: { event: 'instalment.missed', alsoEmits: ['message.sent'] },
  },
  missed: {
    in_grace: {
      event: 'instalment.in_grace',
      alsoEmits: ['message.sent'],
      guards: [graceDaysComeFromScheduleMode, gracePeriodStillOpen],
      note: 'The message carries what continuity costs, not only the amount.',
    },
  },
  in_grace: {
    paid_in_grace: {
      event: 'instalment.paid',
      guards: [instalmentAmountTypedNotDerived, paymentChannelRecorded, gracePeriodStillOpen],
    },
    grace_expired: {
      event: 'instalment.grace_expired',
      alsoEmits: ['message.sent', 'task.created'],
      guards: [graceWindowHasExpired],
    },
  },
  paid_in_grace: {
    scheduled: {
      event: 'instalment.resumed',
      note: '§9: back to schedule. The next instalment carries on as planned.',
    },
  },
  grace_expired: {
    lapsed: { event: 'policy.lapsed', alsoEmits: ['message.sent'] },
  },
} as const satisfies TransitionTable<InstalmentState, InstalmentContext>

export const instalmentMachine = createMachine<InstalmentState, InstalmentContext>({
  name: 'instalment',
  states: Object.values(INSTALMENT_STATES),
  initial: INSTALMENT_STATES.scheduled,
  transitions: INSTALMENT_TRANSITIONS,
})
