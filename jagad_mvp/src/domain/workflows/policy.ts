/**
 * Policy — plan §9, FR-10.1, canvas n16-n25, M0.
 *
 *   draft -> proposal -> sent -> issued | declined
 *                                  |
 *                          dispatched -> documents_collected -> closed -> locked
 *
 * Three §9 rules: issue is gated on KYC complete AND a non-empty Final Premium
 * with the components staying optional, the direct-entry path skips proposal for
 * policies the insurer already issued, and a closed policy past its retention
 * class locks rather than being deleted.
 */

import { isMoney } from '../money'
import type { Money } from '../money'
import { PREMIUM_SOURCES } from './quotation'
import type { PremiumSource } from './quotation'
import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'

export const POLICY_STATES = {
  draft: 'draft',
  proposal: 'proposal',
  sent: 'sent',
  issued: 'issued',
  declined: 'declined',
  dispatched: 'dispatched',
  documentsCollected: 'documents_collected',
  closed: 'closed',
  locked: 'locked',
  lapsed: 'lapsed',
} as const

export type PolicyState = (typeof POLICY_STATES)[keyof typeof POLICY_STATES]

/**
 * How this policy entered the platform. `proposal` walks the full path; `direct`
 * is the back-entry for a policy the insurer has already issued, and §9 says it
 * skips proposal rather than pretending one was sent.
 */
export const POLICY_ENTRY_PATHS = { proposal: 'proposal', direct: 'direct' } as const
export type PolicyEntryPath = (typeof POLICY_ENTRY_PATHS)[keyof typeof POLICY_ENTRY_PATHS]

export const KYC_STATES = { pending: 'pending', partial: 'partial', complete: 'complete' } as const
export type KycState = (typeof KYC_STATES)[keyof typeof KYC_STATES]

export type PolicyContext = {
  readonly now: Date
  readonly entryPath: PolicyEntryPath
  readonly kycState: KycState
  /** Present once somebody typed the insurer's figure. Absent is a real state, not a zero. */
  readonly finalPremium?: Money
  readonly finalPremiumSource?: PremiumSource
  /** Components are optional forever — §9 is explicit about it. Never guarded on. */
  readonly netPremium?: Money
  readonly gstAmount?: Money
  readonly retentionClass?: string
  /** Retention years per class, from config. §9 quotes 10 years; the number is not hard-coded here. */
  readonly retentionYearsByClass?: Readonly<Record<string, number>>
  readonly closedAt?: string
  readonly declineReason?: string
}

/** §9: issue is gated on KYC complete. */
export function kycComplete(ctx: PolicyContext): TransitionResult {
  if (ctx.kycState !== KYC_STATES.complete) {
    return refuse(
      `KYC is ${ctx.kycState}. A policy cannot be issued until KYC is complete for the proposer and every member.`,
    )
  }
  return allow()
}

/**
 * §9: issue is gated on "a non-empty Final Premium. Components stay optional."
 * This checks presence and provenance. It never adds anything up and it never
 * asks for the components.
 */
export function finalPremiumPresentAndTyped(ctx: PolicyContext): TransitionResult {
  if (!isMoney(ctx.finalPremium)) {
    return refuse(
      'Final Premium is empty. Type the figure from the insurer before issuing — the platform records premiums, it does not calculate them.',
    )
  }
  if (ctx.finalPremiumSource === PREMIUM_SOURCES.computed) {
    return refuse(
      'Final Premium is marked as computed. This figure is typed from the insurer, never derived from anything the platform holds.',
    )
  }
  return allow()
}

/** §9: "Direct-entry path skips proposal for already-issued policies." */
export function directEntryPath(ctx: PolicyContext): TransitionResult {
  if (ctx.entryPath !== POLICY_ENTRY_PATHS.direct) {
    return refuse(
      'This policy is on the proposal path, so it goes draft to proposal to sent before it is issued. Only direct entry skips proposal.',
    )
  }
  return allow()
}

export function proposalPath(ctx: PolicyContext): TransitionResult {
  if (ctx.entryPath !== POLICY_ENTRY_PATHS.proposal) {
    return refuse('This policy was entered directly against an already-issued policy, so there is no proposal to raise.')
  }
  return allow()
}

export function declineRequiresReason(ctx: PolicyContext): TransitionResult {
  if (!ctx.declineReason || ctx.declineReason.trim().length === 0) {
    return refuse('Record the insurer reason for declining this proposal.')
  }
  return allow()
}

/** Retention years for a class, from config. Absent class means the caller has not configured it. */
export function retentionYearsFor(ctx: PolicyContext): number | undefined {
  if (!ctx.retentionClass) return undefined
  return ctx.retentionYearsByClass?.[ctx.retentionClass]
}

/** §9: "A closed policy past its retention class locks; it is never hard-deleted." */
export function retentionWindowElapsed(ctx: PolicyContext): TransitionResult {
  if (!ctx.closedAt) {
    return refuse('The retention clock starts when a policy closes, and this one has no closing date.')
  }
  const years = retentionYearsFor(ctx)
  if (typeof years !== 'number') {
    return refuse(
      `No retention period is configured for retention class "${ctx.retentionClass ?? 'unset'}". Retention comes from the class, not from a constant in code.`,
    )
  }

  const lockDue = new Date(ctx.closedAt)
  lockDue.setFullYear(lockDue.getFullYear() + years)
  if (ctx.now < lockDue) {
    return refuse(
      `This policy is inside its ${years}-year retention window, which runs until ${lockDue.toISOString().slice(0, 10)}. It stays readable and editable until then.`,
    )
  }
  return allow()
}

/**
 * The answer is always no, and it is a function so a screen can render the
 * sentence rather than a developer having to remember the rule. §9: locked,
 * never hard-deleted.
 */
export function canHardDeletePolicy(): TransitionResult {
  return refuse(
    'Policy records are never deleted. Past its retention class a closed policy locks: it stays readable, and nothing can change it.',
  )
}

export const POLICY_TRANSITIONS = {
  draft: {
    proposal: { event: 'policy.proposal_created', guards: [proposalPath] },
    issued: {
      event: 'policy.issued',
      guards: [directEntryPath, kycComplete, finalPremiumPresentAndTyped],
      note: '§9: the direct-entry path skips proposal for already-issued policies.',
    },
  },
  proposal: {
    sent: { event: 'policy.proposal_sent', alsoEmits: ['message.sent'] },
  },
  sent: {
    issued: {
      event: 'policy.issued',
      guards: [kycComplete, finalPremiumPresentAndTyped],
      note: '§9: issue is gated on KYC complete and a non-empty Final Premium.',
    },
    declined: { event: 'policy.declined', guards: [declineRequiresReason] },
  },
  issued: {
    dispatched: { event: 'policy.dispatched' },
    lapsed: { event: 'policy.lapsed', note: 'Reached from the instalment machine when the grace window expires.' },
  },
  dispatched: {
    documents_collected: { event: 'policy.documents_collected' },
  },
  documents_collected: {
    closed: { event: 'policy.closed' },
  },
  closed: {
    locked: {
      event: 'policy.locked',
      guards: [retentionWindowElapsed],
      note: '§9: retention lock. The alternative is not deletion, it is waiting.',
    },
  },
} as const satisfies TransitionTable<PolicyState, PolicyContext>

export const policyMachine = createMachine<PolicyState, PolicyContext>({
  name: 'policy',
  states: Object.values(POLICY_STATES),
  initial: POLICY_STATES.draft,
  transitions: POLICY_TRANSITIONS,
})
