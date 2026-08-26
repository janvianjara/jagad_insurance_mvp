/**
 * The queue predicates and the thresholds, in one place — pure, and typed
 * against the projections rather than against entity types.
 *
 * Two things are true of this file and both are deliberate.
 *
 * It is the only place a status literal is written. Every predicate takes an
 * `Assistant…` projection, so the compiler checks each literal against the
 * status union the projection carries: a state renamed in `src/domain/workflows`
 * fails the build here rather than quietly matching nothing at runtime. That is
 * the compensation for not being allowed to import the status constants — the
 * eslint zone forbids `src/domain`, and it is right to.
 *
 * It is shared by the briefing, the Ask cards and the proactive rules. A
 * briefing that counted "TAT at risk" one way and a notice that fired on another
 * would be two different products disagreeing on the same screen; there is one
 * definition of each phrase and all three read it.
 */

import type {
  AssistantClaim,
  AssistantInquiry,
  AssistantQuotation,
  AssistantRenewal,
  AssistantTask,
} from '../../data/assistant'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * The thresholds P-09 names. They are constants here and configuration in P1
 * (FR-22, "Config — L1: proactive thresholds per role"), so every consumer reads
 * the number from one place and the later move is a change of source, not of
 * shape.
 */
export const THRESHOLDS = {
  /** An inquiry this close to its turnaround needs a person now. */
  tatRiskMs: 3 * HOUR_MS,
  /** An open claim older than this is aged, per FR-22.8's example. */
  claimAgingMs: 30 * DAY_MS,
  /** "Due this week" means the next seven days, not the calendar week. */
  weekMs: 7 * DAY_MS,
} as const

export const THRESHOLD_WORDS = {
  tatRiskMs: 'the three-hour turnaround window',
  claimAgingMs: 'the thirty-day aging threshold',
} as const

function msAt(value: string | null | undefined): number | null {
  if (!value) return null
  const at = new Date(value).getTime()
  return Number.isNaN(at) ? null : at
}

/* -------------------------------------------------------------- inquiries */

/** Still in play. `converted` and `lost` have left the queue; `unrouted` has not. */
const OPEN_INQUIRY_STATES: readonly AssistantInquiry['status'][] = [
  'new',
  'assigned',
  'accepted',
  'reassigned',
  'unrouted',
  'escalated',
]

export function isOpenInquiry(row: AssistantInquiry): boolean {
  return OPEN_INQUIRY_STATES.includes(row.status)
}

export function isUnassignedInquiry(row: AssistantInquiry): boolean {
  return isOpenInquiry(row) && row.ownerId === null
}

/** Milliseconds until the turnaround falls due. Negative once it has lapsed. */
export function tatRemainingMs(row: AssistantInquiry, now: Date): number | null {
  const due = msAt(row.tatDueAt)
  return due === null ? null : due - now.getTime()
}

/** The allowance this inquiry was actually given, from its own two timestamps. */
export function tatAllowanceMs(row: AssistantInquiry): number | null {
  const due = msAt(row.tatDueAt)
  const assigned = msAt(row.assignedAt)
  if (due === null || assigned === null) return null
  return Math.max(0, due - assigned)
}

/** Inside the window and not yet lapsed: still saveable, which is the point. */
export function isTatAtRisk(row: AssistantInquiry, now: Date): boolean {
  if (!isOpenInquiry(row)) return false
  const remaining = tatRemainingMs(row, now)
  return remaining !== null && remaining > 0 && remaining <= THRESHOLDS.tatRiskMs
}

export function isTatLapsed(row: AssistantInquiry, now: Date): boolean {
  if (!isOpenInquiry(row)) return false
  const remaining = tatRemainingMs(row, now)
  return remaining !== null && remaining <= 0
}

/* ------------------------------------------------------------- quotations */

const DRAFT_QUOTATION_STATES: readonly AssistantQuotation['status'][] = [
  'draft',
  'composed',
  'generated',
]

export function isDraftQuotation(row: AssistantQuotation): boolean {
  return DRAFT_QUOTATION_STATES.includes(row.status)
}

/** Shared and not answered: neither won, nor lost, nor sent back for revision. */
export function isAwaitingReply(row: AssistantQuotation): boolean {
  return row.status === 'shared'
}

/* ------------------------------------------------------------------ tasks */

const OPEN_TASK_STATES: readonly AssistantTask['state'][] = ['open', 'in_progress']

export function isOpenTask(row: AssistantTask): boolean {
  return OPEN_TASK_STATES.includes(row.state)
}

export function isOverdueTask(row: AssistantTask, now: Date): boolean {
  const due = msAt(row.dueAt)
  return isOpenTask(row) && due !== null && due < now.getTime()
}

export function isDueThisWeek(row: AssistantTask, now: Date): boolean {
  const due = msAt(row.dueAt)
  if (!isOpenTask(row) || due === null) return false
  const ahead = due - now.getTime()
  return ahead >= 0 && ahead <= THRESHOLDS.weekMs
}

export function isMandateFailure(row: AssistantTask): boolean {
  return isOpenTask(row) && row.kind === 'mandate_failure'
}

export function isPolicyEntryTask(row: AssistantTask): boolean {
  return isOpenTask(row) && row.kind === 'policy_entry'
}

/* ----------------------------------------------------------------- claims */

export function isOpenClaim(row: AssistantClaim): boolean {
  return row.state !== 'closed'
}

export function isInsurerQuery(row: AssistantClaim): boolean {
  return row.state === 'query_open'
}

export function claimAgeMs(row: AssistantClaim, now: Date): number {
  const raised = msAt(row.raisedAt)
  return raised === null ? 0 : now.getTime() - raised
}

export function isAgedClaim(row: AssistantClaim, now: Date): boolean {
  return isOpenClaim(row) && claimAgeMs(row, now) > THRESHOLDS.claimAgingMs
}

/* --------------------------------------------------------------- renewals */

const CLOSED_RENEWAL_STATES: readonly AssistantRenewal['state'][] = ['renewed', 'lapsed']

export function isOpenRenewal(row: AssistantRenewal): boolean {
  return !CLOSED_RENEWAL_STATES.includes(row.state)
}

export function isRenewalDueThisWeek(row: AssistantRenewal, now: Date): boolean {
  const due = msAt(row.dueOn)
  if (!isOpenRenewal(row) || due === null) return false
  const ahead = due - now.getTime()
  return ahead >= 0 && ahead <= THRESHOLDS.weekMs
}

export function isLapsedRenewal(row: AssistantRenewal): boolean {
  return row.state === 'lapsed'
}
