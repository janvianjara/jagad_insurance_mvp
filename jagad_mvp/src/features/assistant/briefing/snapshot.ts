/**
 * One read of the user's own queue, as projections — plan §14 FR-22.1.
 *
 * The landing briefing has to be true of the data at the moment it renders, so
 * it cannot be written; it has to be counted. This module does the counting and
 * nothing else: five list reads through the projection facade, each already
 * scope-filtered by `can()` as the requesting user, sorted into the sets the
 * briefing and the proactive rules both talk about.
 *
 * The snapshot keeps the rows, not just the totals. A count with its rows thrown
 * away cannot be shown, and a briefing that says "two are close to their TAT"
 * without being able to name them is a briefing nobody can act on.
 *
 * Everything here is scoped by the facade before it arrives (FR-22.3). An agent
 * gets their own book because the repository gave them their own book — there is
 * no filtering by user id in this file, and there must never be one, or the
 * scope would have two implementations and only one of them would be tested.
 */

import type {
  AssistantClaim,
  AssistantInquiry,
  AssistantQuotation,
  AssistantRenewal,
  AssistantRepository,
  AssistantTask,
} from '../../../data/assistant'
import {
  isAgedClaim,
  isAwaitingReply,
  isDraftQuotation,
  isDueThisWeek,
  isInsurerQuery,
  isLapsedRenewal,
  isMandateFailure,
  isOpenClaim,
  isOpenInquiry,
  isOpenTask,
  isOverdueTask,
  isPolicyEntryTask,
  isRenewalDueThisWeek,
  isTatAtRisk,
  isTatLapsed,
  isUnassignedInquiry,
  tatRemainingMs,
} from '../queue-rules'

/**
 * One page big enough to hold the whole scoped set. The mock store's largest
 * table is ~800 rows; a briefing built from a truncated page would state a
 * number smaller than the truth, which is worse than stating none.
 */
const SNAPSHOT_PAGE = 5000

export type QueueSnapshot = {
  /** The moment every clock in this snapshot was read against. */
  readonly now: string
  /** False when the account holds no Assistant grant. Everything else is empty. */
  readonly enabled: boolean

  readonly inquiriesOpen: readonly AssistantInquiry[]
  readonly inquiriesUnassigned: readonly AssistantInquiry[]
  readonly inquiriesTatAtRisk: readonly AssistantInquiry[]
  readonly inquiriesTatLapsed: readonly AssistantInquiry[]

  readonly quotationsAwaitingReply: readonly AssistantQuotation[]
  readonly quotationsDraft: readonly AssistantQuotation[]

  readonly tasksOpen: readonly AssistantTask[]
  readonly tasksOverdue: readonly AssistantTask[]
  readonly tasksDueThisWeek: readonly AssistantTask[]
  readonly tasksMandateFailure: readonly AssistantTask[]
  readonly tasksPolicyEntry: readonly AssistantTask[]

  readonly claimsOpen: readonly AssistantClaim[]
  readonly claimsAged: readonly AssistantClaim[]
  readonly claimsInsurerQuery: readonly AssistantClaim[]

  readonly renewalsDueThisWeek: readonly AssistantRenewal[]
  readonly renewalsLapsed: readonly AssistantRenewal[]
  /**
   * Due inside the week and nobody has been told yet.
   *
   * The prototype's renewals briefing says "12 have had no reminder yet", and
   * that clause is only sayable if the count exists. `remindersSent` is on the
   * projection already, so this is a filter of a filter rather than a new read.
   */
  readonly renewalsNoReminder: readonly AssistantRenewal[]
}

export function emptySnapshot(now: Date, enabled = false): QueueSnapshot {
  return {
    now: now.toISOString(),
    enabled,
    inquiriesOpen: [],
    inquiriesUnassigned: [],
    inquiriesTatAtRisk: [],
    inquiriesTatLapsed: [],
    quotationsAwaitingReply: [],
    quotationsDraft: [],
    tasksOpen: [],
    tasksOverdue: [],
    tasksDueThisWeek: [],
    tasksMandateFailure: [],
    tasksPolicyEntry: [],
    claimsOpen: [],
    claimsAged: [],
    claimsInsurerQuery: [],
    renewalsDueThisWeek: [],
    renewalsLapsed: [],
    renewalsNoReminder: [],
  }
}

/** Soonest deadline first: the order a person would work them in. */
function bySoonestTat(now: Date) {
  return (left: AssistantInquiry, right: AssistantInquiry) =>
    (tatRemainingMs(left, now) ?? Number.MAX_SAFE_INTEGER) -
    (tatRemainingMs(right, now) ?? Number.MAX_SAFE_INTEGER)
}

export async function loadQueueSnapshot(
  repo: AssistantRepository,
  now: Date,
): Promise<QueueSnapshot> {
  if (!repo.enabled) return emptySnapshot(now, false)

  const query = { pageSize: SNAPSHOT_PAGE }
  const [inquiries, quotations, tasks, claims, renewals] = await Promise.all([
    repo.inquiries(query),
    repo.quotations(query),
    repo.tasks(query),
    repo.claims(query),
    repo.renewals(query),
  ])

  const renewalsDueThisWeek = renewals.rows.filter((row) => isRenewalDueThisWeek(row, now))
  const inquiriesOpen = inquiries.rows.filter(isOpenInquiry)
  const tasksOpen = tasks.rows.filter(isOpenTask)
  const claimsOpen = claims.rows.filter(isOpenClaim)

  return {
    now: now.toISOString(),
    enabled: true,

    inquiriesOpen,
    inquiriesUnassigned: inquiriesOpen.filter(isUnassignedInquiry),
    inquiriesTatAtRisk: inquiriesOpen
      .filter((row) => isTatAtRisk(row, now))
      .sort(bySoonestTat(now)),
    inquiriesTatLapsed: inquiriesOpen.filter((row) => isTatLapsed(row, now)).sort(bySoonestTat(now)),

    quotationsAwaitingReply: quotations.rows.filter(isAwaitingReply),
    quotationsDraft: quotations.rows.filter(isDraftQuotation),

    tasksOpen,
    tasksOverdue: tasksOpen.filter((row) => isOverdueTask(row, now)),
    tasksDueThisWeek: tasksOpen.filter((row) => isDueThisWeek(row, now)),
    tasksMandateFailure: tasksOpen.filter(isMandateFailure),
    tasksPolicyEntry: tasksOpen.filter(isPolicyEntryTask),

    claimsOpen,
    claimsAged: claimsOpen.filter((row) => isAgedClaim(row, now)),
    claimsInsurerQuery: claimsOpen.filter(isInsurerQuery),

    renewalsDueThisWeek,
    renewalsLapsed: renewals.rows.filter(isLapsedRenewal),
    renewalsNoReminder: renewalsDueThisWeek.filter((row) => row.remindersSent === 0),
  }
}
