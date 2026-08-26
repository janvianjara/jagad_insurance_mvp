/**
 * Mandate - plan §9, decision D-A, prototype r_mandate, P2.
 *
 *   registered -> active -+- debit_success (recorded, stays active)
 *                         +- debit_failed -> follow-up task, agent notified
 *                         +- cancelled | expired
 *
 * The §9 bullet that shapes this module is a boundary, not a workflow: "The
 * platform records mandate outcomes; it never initiates a debit and never stores
 * bank credentials." So there is no debit function here to call by mistake, the
 * context type has no account fields, and a caller that supplies them is refused.
 *
 * The second rule is a clock. A failed debit raises a same-day follow-up inside
 * the grace window, because a follow-up scheduled for after the grace closes is
 * a task about a policy that has already lapsed.
 */

import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'

export const MANDATE_STATES = {
  registered: 'registered',
  active: 'active',
  debitFailed: 'debit_failed',
  cancelled: 'cancelled',
  expired: 'expired',
} as const

export type MandateState = (typeof MANDATE_STATES)[keyof typeof MANDATE_STATES]

/** An outcome reported by the bank or the insurer. The platform only ever records these. */
export type MandateEvent = {
  readonly outcome: 'success' | 'failure'
  readonly occurredAt: string
  readonly reference: string
  readonly failureReason?: string
}

export type MandateFollowUp = {
  readonly taskId: string
  readonly dueOn: string
  /** The agent who has to make the call. */
  readonly notifyAgentId: string
}

export type MandateContext = {
  readonly now: Date
  readonly registrationReference?: string
  readonly latestEvent?: MandateEvent
  readonly followUp?: MandateFollowUp
  /** End of the grace window the failed instalment is sitting in. */
  readonly graceEndsAt?: string
  readonly agentNotified?: boolean
  readonly validUntil?: string
  readonly cancellationReason?: string
  /**
   * Set only when a caller tries to hand this module bank details. It exists so
   * the refusal is testable; nothing ever reads the value.
   */
  readonly bankCredentialsSupplied?: boolean
  /** Set when a caller claims the platform triggered the debit. Always refused. */
  readonly debitInitiatedByPlatform?: boolean
}

/**
 * The answer is always no. A function rather than an absence, so the screen and
 * the audit log can both state the boundary in words.
 */
export function canPlatformInitiateDebit(): TransitionResult {
  return refuse(
    'This platform never initiates a debit. The bank or the insurer runs the mandate; the platform records what came back.',
  )
}

export function platformStoresNoBankCredentials(ctx: MandateContext): TransitionResult {
  if (ctx.bankCredentialsSupplied === true) {
    return refuse(
      'Bank credentials are never stored here. The mandate is registered with the bank and this platform keeps only its reference.',
    )
  }
  if (ctx.debitInitiatedByPlatform === true) {
    return refuse(
      'This debit is recorded as platform-initiated, which cannot happen. Record the outcome the bank reported instead.',
    )
  }
  return allow()
}

export function mandateRegistered(ctx: MandateContext): TransitionResult {
  if (!ctx.registrationReference || ctx.registrationReference.trim().length === 0) {
    return refuse('Record the mandate registration reference from the bank.')
  }
  return platformStoresNoBankCredentials(ctx)
}

export function debitOutcomeRecorded(ctx: MandateContext): TransitionResult {
  const event = ctx.latestEvent
  if (!event) {
    return refuse('No mandate outcome has been recorded.')
  }
  if (!event.reference || event.reference.trim().length === 0) {
    return refuse('A mandate outcome carries the bank reference it was reported under.')
  }
  return platformStoresNoBankCredentials(ctx)
}

export function debitSucceeded(ctx: MandateContext): TransitionResult {
  const recorded = debitOutcomeRecorded(ctx)
  if (!recorded.ok) return recorded
  if (ctx.latestEvent?.outcome !== 'success') {
    return refuse('The recorded outcome is a failure, so this mandate does not return to active on it.')
  }
  return allow()
}

/**
 * §9: "debit_failed (MandateEvent) -> follow-up task, agent notified", and the
 * follow-up is same-day and inside the grace window.
 */
export function failureRaisesSameDayFollowUpInsideGrace(ctx: MandateContext): TransitionResult {
  const event = ctx.latestEvent
  if (!event || event.outcome !== 'failure') {
    return refuse('No failed debit is recorded against this mandate.')
  }
  if (!event.failureReason || event.failureReason.trim().length === 0) {
    return refuse('Record the reason the bank gave for the failed debit.')
  }

  const followUp = ctx.followUp
  if (!followUp) {
    return refuse(
      'A failed debit raises a follow-up task in the same move. Without it the customer finds out when the policy lapses.',
    )
  }

  const failureDay = event.occurredAt.slice(0, 10)
  if (followUp.dueOn.slice(0, 10) !== failureDay) {
    return refuse(
      `The follow-up is due on ${followUp.dueOn.slice(0, 10)} but the debit failed on ${failureDay}. A failed debit is chased the same day.`,
    )
  }

  if (!ctx.graceEndsAt) {
    return refuse('The grace window for this instalment is unknown, so the follow-up cannot be placed inside it.')
  }
  if (new Date(followUp.dueOn) > new Date(ctx.graceEndsAt)) {
    return refuse(
      `The follow-up falls after the grace window closes on ${ctx.graceEndsAt.slice(0, 10)}. A task raised after grace is a task about a lapsed policy.`,
    )
  }

  if (!followUp.notifyAgentId || ctx.agentNotified !== true) {
    return refuse('The agent is notified of a failed debit as part of the same move.')
  }
  return platformStoresNoBankCredentials(ctx)
}

export function mandateHasExpired(ctx: MandateContext): TransitionResult {
  if (!ctx.validUntil) {
    return refuse('This mandate has no validity end date, so it cannot be marked expired.')
  }
  if (new Date(ctx.validUntil) > ctx.now) {
    return refuse(`This mandate is valid until ${ctx.validUntil.slice(0, 10)} and is still active.`)
  }
  return allow()
}

export function cancellationRequiresReason(ctx: MandateContext): TransitionResult {
  if (!ctx.cancellationReason || ctx.cancellationReason.trim().length === 0) {
    return refuse('Record why this mandate is being cancelled.')
  }
  return allow()
}

/**
 * The prototype's r_mandate pattern: two failures inside three months is worth
 * telling the agent about, because the third one is usually a lapse. Reads a
 * history and returns a fact - it raises nothing by itself.
 */
export function twoFailuresInThreeMonths(
  history: readonly MandateEvent[],
  now: Date,
): boolean {
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - 3)

  const recentFailures = history.filter(
    (event) => event.outcome === 'failure' && new Date(event.occurredAt) >= cutoff,
  )
  return recentFailures.length >= 2
}

export const MANDATE_TRANSITIONS = {
  registered: {
    active: { event: 'mandate.registered', guards: [mandateRegistered] },
  },
  active: {
    active: {
      event: 'mandate.debit_succeeded',
      guards: [debitSucceeded],
      note: 'A successful debit is recorded and the mandate carries on. §9 draws it as a branch off active.',
    },
    debit_failed: {
      event: 'mandate.failed',
      alsoEmits: ['task.created', 'message.sent'],
      guards: [failureRaisesSameDayFollowUpInsideGrace],
    },
    cancelled: { event: 'mandate.cancelled', guards: [cancellationRequiresReason] },
    expired: { event: 'mandate.expired', guards: [mandateHasExpired] },
  },
  debit_failed: {
    active: { event: 'mandate.debit_succeeded', guards: [debitSucceeded] },
    cancelled: { event: 'mandate.cancelled', guards: [cancellationRequiresReason] },
  },
} as const satisfies TransitionTable<MandateState, MandateContext>

export const mandateMachine = createMachine<MandateState, MandateContext>({
  name: 'mandate',
  states: Object.values(MANDATE_STATES),
  initial: MANDATE_STATES.registered,
  transitions: MANDATE_TRANSITIONS,
})
