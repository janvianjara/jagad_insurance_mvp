/**
 * The task, read. Pure — no DOM, no repository, no React.
 *
 * A task is the product's one polymorphic work item (FR-15, plan §8): it points
 * at whatever it is about through `subjectEntity` plus `subjectId` rather than
 * through a dozen nullable foreign keys. Everything awkward about that shape is
 * handled here, in three small pieces:
 *
 *   1. **Delivery.** FR-15 says "push or pull per module", and in this data model
 *      that distinction is already recorded: a task with an owner was pushed to a
 *      person, a task without one is sitting in a team pool for somebody to pull.
 *      There is no second field to invent and no per-module table — `ownerId`
 *      already says it.
 *
 *   2. **Where a row leads.** `subjectEntity` is a plain string, so the map from
 *      it to an address lives here and returns `null` for anything unrecognised.
 *      A task about an entity with no screen still renders; it just does not
 *      pretend to be a link.
 *
 *   3. **Severity.** A queue is scanned by how much trouble a row is in, not by
 *      which status it holds. Overdue outranks urgent, an unclaimed task is
 *      `attn` because it needs a person to pick it up, and a finished one is
 *      quiet.
 */

import type { Task, TaskKind, TaskPriority, TaskState } from '../../data/repo'
import type { Severity, Tone } from '../../ui/tone'

export const TASK_KIND_LABEL: Readonly<Record<TaskKind, string>> = {
  inquiry_follow_up: 'Inquiry follow-up',
  kyc_chase: 'KYC chase',
  payment_follow_up: 'Payment follow-up',
  cheque_bounce: 'Cheque bounce',
  mandate_failure: 'Mandate failure',
  document_collection: 'Document collection',
  claim_pickup: 'Claim pickup',
  renewal_call: 'Renewal call',
  policy_entry: 'Policy entry',
}

export const TASK_STATE_LABEL: Readonly<Record<TaskState, string>> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
}

export const TASK_STATE_TONE: Readonly<Record<TaskState, Tone>> = {
  open: 'attn',
  in_progress: 'info',
  done: 'ok',
  cancelled: 'idle',
}

export const TASK_PRIORITY_LABEL: Readonly<Record<TaskPriority, string>> = {
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

export const TASK_PRIORITY_TONE: Readonly<Record<TaskPriority, Tone>> = {
  normal: 'idle',
  high: 'warn',
  urgent: 'bad',
}

/* --------------------------------------------------------------- delivery */

export const TASK_DELIVERIES = {
  /** Assigned to a named person. It is on their list whether they asked or not. */
  push: 'push',
  /** Unclaimed, sitting in a team pool. Somebody has to take it. */
  pull: 'pull',
} as const

export type TaskDelivery = (typeof TASK_DELIVERIES)[keyof typeof TASK_DELIVERIES]

export const TASK_DELIVERY_LABEL: Readonly<Record<TaskDelivery, string>> = {
  push: 'Pushed',
  pull: 'Pool',
}

export function deliveryOf(task: Task): TaskDelivery {
  return task.ownerId === null ? TASK_DELIVERIES.pull : TASK_DELIVERIES.push
}

/* ------------------------------------------------------------ the subject */

/**
 * The record a task belongs to, as an address.
 *
 * Keyed on the entity name the repository stores, which is why the keys are
 * capitalised: `Task.subjectEntity` holds `'Policy'`, not `'policy'`. Anything
 * absent from this map has no screen in §4 yet, and the row says so rather than
 * linking somewhere that does not exist.
 */
const SUBJECT_ROUTE: Readonly<Record<string, (id: string) => string>> = {
  Policy: (id) => `/policies/${id}`,
  Customer: (id) => `/customers/${id}`,
  Inquiry: (id) => `/inquiries/${id}`,
  Quotation: (id) => `/quotations/${id}`,
  Deal: (id) => `/deals/${id}`,
  Claim: (id) => `/claims/${id}`,
}

export const SUBJECT_LABEL: Readonly<Record<string, string>> = {
  Policy: 'Policy',
  Customer: 'Customer',
  Inquiry: 'Inquiry',
  Quotation: 'Quotation',
  Deal: 'Deal',
  Claim: 'Claim',
}

export function subjectHref(task: Task): string | null {
  const build = SUBJECT_ROUTE[task.subjectEntity]
  return build ? build(task.subjectId) : null
}

export function subjectLabel(task: Task): string {
  return SUBJECT_LABEL[task.subjectEntity] ?? task.subjectEntity
}

/** Every entity a task can point at, for the queue's subject filter. */
export const SUBJECT_ENTITIES: readonly string[] = Object.keys(SUBJECT_ROUTE)

/* ------------------------------------------------------------- severity */

const DAY_MS = 24 * 60 * 60 * 1000

/** The states where a task is still work. Anything else has stopped. */
export const LIVE_TASK_STATES: readonly TaskState[] = ['open', 'in_progress']

export function isLive(task: Task): boolean {
  return LIVE_TASK_STATES.includes(task.state)
}

export function isOverdue(task: Task, now: Date): boolean {
  if (!isLive(task)) return false
  return new Date(task.dueAt).getTime() < now.getTime()
}

/**
 * How much trouble a row is in.
 *
 * Overdue first, because a missed date is a fact and a priority is an opinion.
 * An unclaimed task is `attn` — lime, needs a person — which is exactly what a
 * pool row is: nothing is wrong with it, it simply has nobody.
 */
export function taskSeverity(task: Task, now: Date): Severity {
  if (task.state === 'done') return 'good'
  if (task.state === 'cancelled') return 'cool'
  if (isOverdue(task, now)) return 'hot'
  if (task.priority === 'urgent') return 'hot'
  if (task.ownerId === null) return 'attn'
  if (new Date(task.dueAt).getTime() - now.getTime() < DAY_MS) return 'warm'
  return 'cool'
}
