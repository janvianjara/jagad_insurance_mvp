/**
 * Work — tasks and renewal tasks. Plan §8, cluster "Work"; canvas flow 5.
 *
 * A `Task` is the generic unit of work every recipe raises: the bounced-cheque
 * follow-up, the mandate-failure call, the on-field pickup. It points at whatever
 * it is about through `subjectEntity` plus `subjectId` rather than through a
 * dozen nullable foreign keys.
 *
 * A `RenewalTask` is not one of those. It has its own machine in §9 — scheduled,
 * pooled, assigned, reminded, renewed or lapsed — and pretending it is a task
 * with a status string is how the renewals queue stops being able to tell a due
 * instalment from an expiring policy. Two clocks, two entities.
 */

import type { RenewalState } from '../../domain/workflows'
import type { ListQuery, Page, ReadRepository } from './query'
import type { MutationResult } from './result'

export const TASK_STATES = {
  open: 'open',
  inProgress: 'in_progress',
  done: 'done',
  cancelled: 'cancelled',
} as const

export type TaskState = (typeof TASK_STATES)[keyof typeof TASK_STATES]

export const TASK_PRIORITIES = {
  normal: 'normal',
  high: 'high',
  urgent: 'urgent',
} as const

export type TaskPriority = (typeof TASK_PRIORITIES)[keyof typeof TASK_PRIORITIES]

export const TASK_KINDS = {
  inquiryFollowUp: 'inquiry_follow_up',
  kycChase: 'kyc_chase',
  paymentFollowUp: 'payment_follow_up',
  chequeBounce: 'cheque_bounce',
  mandateFailure: 'mandate_failure',
  documentCollection: 'document_collection',
  claimPickup: 'claim_pickup',
  renewalCall: 'renewal_call',
  policyEntry: 'policy_entry',
} as const

export type TaskKind = (typeof TASK_KINDS)[keyof typeof TASK_KINDS]

export type Task = {
  readonly id: string
  readonly systemNo: string
  readonly kind: TaskKind
  readonly title: string
  readonly subjectEntity: string
  readonly subjectId: string
  readonly ownerId: string | null
  readonly teamId: string | null
  readonly agentId: string | null
  readonly state: TaskState
  readonly priority: TaskPriority
  readonly dueAt: string
  readonly createdAt: string
  readonly completedAt: string | null
  /** The recipe key that raised it, or the user id when a person did. */
  readonly raisedBy: string
}

export type RenewalTask = {
  readonly id: string
  readonly policyId: string
  readonly customerId: string
  readonly state: RenewalState
  /** Expiry minus the recipe's lead days. The pull queue sorts on this. */
  readonly dueOn: string
  readonly expiryDate: string
  readonly assigneeId: string | null
  readonly remindersSent: number
  readonly lastReminderAt: string | null
  readonly lapseReason: string | null
  readonly createdAt: string
}

export type CompleteTaskCommand = {
  readonly actorId: string
  readonly note?: string
  readonly now?: Date
}

export type AssignRenewalCommand = {
  readonly actorId: string
  readonly assigneeId: string
  readonly selfAssigned: boolean
  readonly leadDays: number
  readonly now?: Date
}

export type TaskRepository = ReadRepository<Task> & {
  forOwner(ownerId: string, query?: ListQuery): Promise<Page<Task>>
  forSubject(subjectEntity: string, subjectId: string): Promise<readonly Task[]>
  open(query?: ListQuery): Promise<Page<Task>>
  complete(id: string, command: CompleteTaskCommand): Promise<MutationResult<Task>>
}

export type RenewalRepository = ReadRepository<RenewalTask> & {
  forPolicy(policyId: string): Promise<RenewalTask | null>
  /** The pull queue: unassigned renewal tasks a member can take. */
  pool(query?: ListQuery): Promise<Page<RenewalTask>>
  assign(id: string, command: AssignRenewalCommand): Promise<MutationResult<RenewalTask>>
}
