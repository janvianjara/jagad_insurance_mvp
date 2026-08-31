/**
 * The customer's vocabulary — what the portal is allowed to say, and in whose
 * words.
 *
 * Pure: no DOM, no repository, no React, so the wording is testable on its own
 * and cannot drift between the five screens.
 *
 * The rule this module exists to keep is a product rule, not a styling one. The
 * staff screens speak the machine's language — `upload_link_sent`,
 * `checklist_raised`, `filed_with_insurer` — because an operator needs to know
 * which edge of §9's claim machine a record sits on. A customer does not, and
 * showing them "picked up" or "docs collected" would be showing them the inside
 * of somebody else's workflow. So every state a customer can see is translated
 * here, once, and the staff maps in `claims/claim-view.ts` and
 * `policies/policy-view.ts` are deliberately NOT re-exported.
 *
 * Two things are absent by construction and must stay absent: no diagnosis, no
 * health text and no document content appears in any string below, and no
 * function here produces or adjusts an amount.
 */

import { CLAIM_STATES } from '../../domain/workflows'
import type { ClaimState, PolicyState } from '../../domain/workflows'
import type { Policy } from '../../data/repo'
import type { Tone } from '../../ui/tone'

/* ------------------------------------------------------------------ policies */

/**
 * The states in which cover is actually running. The same three the policies
 * module calls live — restated as a constant here rather than imported so this
 * module stays free of a feature dependency, and asserted equal in the tests.
 */
export const PORTAL_LIVE_STATES: readonly PolicyState[] = [
  'issued',
  'dispatched',
  'documents_collected',
]

/** The day `now` falls on, written the way the records write their dates. */
export function dayOf(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function coverHasEnded(policy: Policy, now: Date): boolean {
  if (policy.expiryDate === null) return false
  return policy.expiryDate < dayOf(now)
}

export function coverIsRunning(policy: Policy, now: Date): boolean {
  if (!PORTAL_LIVE_STATES.includes(policy.status)) return false
  return !coverHasEnded(policy, now)
}

/** Whole days from `now` to a recorded date. Negative once the date has passed. */
export function daysUntil(date: string, now: Date): number {
  const then = Date.parse(`${date}T00:00:00.000Z`)
  const today = Date.parse(`${dayOf(now)}T00:00:00.000Z`)
  return Math.round((then - today) / 86_400_000)
}

export type PortalStatus = { readonly label: string; readonly tone: Tone }

/**
 * What a policy's state is called on a customer's phone.
 *
 * "Being arranged" covers draft, proposal and sent as one thing, because from
 * the outside they are one thing: the agency is still working on it. The three
 * are different to an operator and identical to the person waiting.
 */
export function policyStatusFor(policy: Policy, now: Date): PortalStatus {
  if (coverIsRunning(policy, now)) return { label: 'In force', tone: 'ok' }
  if (PORTAL_LIVE_STATES.includes(policy.status)) {
    return { label: 'Cover has ended', tone: 'attn' }
  }
  switch (policy.status) {
    case 'lapsed':
      return { label: 'Lapsed', tone: 'bad' }
    case 'declined':
      return { label: 'Not issued', tone: 'bad' }
    case 'closed':
    case 'locked':
      return { label: 'Closed', tone: 'idle' }
    default:
      return { label: 'Being arranged', tone: 'info' }
  }
}

/* -------------------------------------------------------------------- claims */

/**
 * The progress spine, in the four things a claimant actually asks about.
 *
 * It is four steps rather than the machine's thirteen states because the two
 * forks §9 draws — cashless and reimbursement — differ in how documents arrive
 * and in nothing else the customer can act on. A spine per fork would show
 * somebody a step they were never going to walk.
 *
 * "Insurer has a question" is not a step. §9 draws `query_open` as a loop off
 * `filed_with_insurer` that can run more than once, so it renders as a state of
 * the third step rather than as a fifth box that appears and disappears.
 */
export const PORTAL_CLAIM_STEPS = [
  { key: 'registered', label: 'Registered' },
  { key: 'documents', label: 'Documents' },
  { key: 'insurer', label: 'With insurer' },
  { key: 'settled', label: 'Settled' },
] as const

export type PortalClaimStepKey = (typeof PORTAL_CLAIM_STEPS)[number]['key']

export type PortalClaimProgress = {
  /** Which step the claim has reached. `-1` for a claim that never started. */
  readonly stepIndex: number
  readonly label: string
  readonly tone: Tone
  /** True when the next move is the customer's. Lime, per U7. */
  readonly waitingOnYou: boolean
  /** One sentence in the customer's own terms. Never operator vocabulary. */
  readonly detail: string
}

const PROGRESS: Readonly<Record<ClaimState, PortalClaimProgress>> = {
  raised: {
    stepIndex: 0,
    label: 'Registered with us',
    tone: 'info',
    waitingOnYou: false,
    detail: 'We have your claim. It goes to your insurer once our claims team has checked the policy.',
  },
  blocked: {
    stepIndex: -1,
    label: 'Could not be registered',
    tone: 'bad',
    waitingOnYou: false,
    detail:
      'This claim could not be sent to the insurer because the policy was not in force on the date given. Your agent has been told and will call you.',
  },
  intimated: {
    stepIndex: 0,
    label: 'Registered with your insurer',
    tone: 'info',
    waitingOnYou: false,
    detail: 'Your insurer has the claim number. Our claims team picks it up from here.',
  },
  picked_up: {
    stepIndex: 0,
    label: 'With our claims team',
    tone: 'info',
    waitingOnYou: false,
    detail: 'Somebody at Jagad Insurance is handling this claim and will tell you what is needed next.',
  },
  upload_link_sent: {
    stepIndex: 1,
    label: 'We need your hospital documents',
    tone: 'attn',
    waitingOnYou: true,
    detail:
      'We have sent you a link to send the hospital paperwork. Nothing moves to the insurer until it arrives.',
  },
  summary_received: {
    stepIndex: 1,
    label: 'Documents received',
    tone: 'info',
    waitingOnYou: false,
    detail: 'Your paperwork is on the file. Nothing further is needed from you at the moment.',
  },
  tracked: {
    stepIndex: 2,
    label: 'With your insurer',
    tone: 'info',
    waitingOnYou: false,
    detail: 'Your insurer is settling this directly with the hospital. We are following it up.',
  },
  checklist_raised: {
    stepIndex: 1,
    label: 'We need your claim documents',
    tone: 'attn',
    waitingOnYou: true,
    detail: 'There is a short list of papers still to reach us. It is shown under this claim.',
  },
  docs_collected: {
    stepIndex: 1,
    label: 'Documents received',
    tone: 'info',
    waitingOnYou: false,
    detail: 'Everything we asked for has arrived. The file goes to your insurer next.',
  },
  filed_with_insurer: {
    stepIndex: 2,
    label: 'With your insurer',
    tone: 'info',
    waitingOnYou: false,
    detail: 'Your claim is with the insurer. We chase it and will tell you as soon as they answer.',
  },
  query_open: {
    stepIndex: 2,
    label: 'Your insurer has asked a question',
    tone: 'attn',
    waitingOnYou: true,
    detail:
      'Your insurer has come back with a query. Somebody from Jagad Insurance will call you about what they need.',
  },
  settlement_recorded: {
    stepIndex: 3,
    label: 'Settled',
    tone: 'ok',
    waitingOnYou: false,
    detail: 'Your insurer has advised the settled amount. It is recorded against this claim.',
  },
  closed: {
    stepIndex: 3,
    label: 'Closed',
    tone: 'idle',
    waitingOnYou: false,
    detail: 'This claim is finished. It stays here for your records.',
  },
}

export function claimProgress(state: ClaimState): PortalClaimProgress {
  return PROGRESS[state]
}

/** Claims a customer can still be waiting on. Used for the overview's counts. */
export function claimIsOpen(state: ClaimState): boolean {
  return state !== CLAIM_STATES.closed && state !== CLAIM_STATES.blocked
}

/* ----------------------------------------------------------------- attention */

/**
 * The five things that can be waiting on a customer, in the order a person
 * should deal with them.
 *
 * A claim query outranks a renewal because a claim query has somebody's money in
 * it and a deadline nobody controls; a renewal outranks an unpaid premium
 * because cover ending is worse than a receipt being late. The order is stated
 * once here so the overview and the "next thing to do" button cannot disagree
 * about what is most urgent.
 */
export const PORTAL_ATTENTION_KINDS = [
  'claim',
  'document',
  'renewal',
  'payment',
  'consent',
] as const

export type PortalAttentionKind = (typeof PORTAL_ATTENTION_KINDS)[number]

export function attentionRank(kind: PortalAttentionKind): number {
  return PORTAL_ATTENTION_KINDS.indexOf(kind)
}
