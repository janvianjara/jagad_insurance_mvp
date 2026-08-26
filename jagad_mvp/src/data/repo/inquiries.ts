/**
 * Demand — inquiries. Plan §8, canvas flow 1.
 *
 * `Inquiry` is one of the seven classified entities, so its fields are exactly
 * the registry's. Note what that excludes: there is no free-form status string
 * here, `status` is the `InquiryState` union, and every move to a new one goes
 * through `inquiryMachine` in the adapter below. The TAT that machine reads comes
 * from the category's routing recipe, never from a constant.
 */

import type { InquiryAssignment, InquiryState } from '../../domain/workflows'
import type { CustomerSource } from './customers'
import type { ListQuery, Page, ReadRepository } from './query'
import type { MutationResult } from './result'

export type Inquiry = {
  readonly id: string
  readonly systemNo: string
  readonly status: InquiryState
  readonly source: CustomerSource
  readonly categoryId: string | null
  readonly productInterest: readonly string[]
  readonly ownerId: string | null
  readonly teamId: string | null
  readonly agentId: string | null
  readonly subAgentId: string | null
  readonly assignedAt: string | null
  /** The moment the clock runs out, precomputed from assignedAt plus the recipe TAT. */
  readonly tatDueAt: string | null
  readonly assignmentHistory: readonly InquiryAssignment[]
  readonly escalationLevel: number
  readonly createdAt: string
  readonly customerId: string | null
  readonly contactName: string
  readonly contactMobile: string
  readonly contactEmail: string | null
  readonly notes: string | null
}

/**
 * The facts routing supplies. `tatMinutes` is required rather than defaulted:
 * §9 holds no default and an omitted TAT must refuse loudly.
 */
export type AssignInquiryCommand = {
  readonly actorId: string
  readonly nextOwnerId: string
  readonly nextOwnerCategoryGroupId: string
  readonly tatMinutes: number
  readonly routingMatchFound: true
  readonly teamId?: string
  readonly reason?: string
  readonly now?: Date
}

export type AcceptInquiryCommand = {
  readonly actorId: string
  readonly confirmedAt: string
  readonly tatMinutes: number
  readonly now?: Date
}

export type ReassignInquiryCommand = {
  readonly actorId: string
  readonly nextOwnerId: string
  readonly nextOwnerCategoryGroupId: string
  readonly tatMinutes: number
  readonly reason?: string
  readonly now?: Date
}

export type EscalateInquiryCommand = {
  readonly actorId: string
  readonly toUserId: string
  readonly tatMinutes: number
  readonly now?: Date
}

export type UnrouteInquiryCommand = {
  readonly actorId: string
  /** §9: the alert is part of the move. Without it, unrouted is a silent drop. */
  readonly adminAlertRaised: true
  readonly now?: Date
}

export type CloseInquiryCommand = {
  readonly actorId: string
  readonly lostReason?: string
  readonly quotationId?: string
  readonly now?: Date
}

export type InquiryRepository = ReadRepository<Inquiry> & {
  bySystemNo(systemNo: string): Promise<Inquiry | null>
  forOwner(ownerId: string, query?: ListQuery): Promise<Page<Inquiry>>
  /** The unrouted queue an admin watches, canvas 1.5. */
  unrouted(query?: ListQuery): Promise<Page<Inquiry>>
  /** Every inquiry whose TAT has already run out at `at`. Feeds the escalation sweep. */
  breachingTat(at: Date, query?: ListQuery): Promise<Page<Inquiry>>

  assign(id: string, command: AssignInquiryCommand): Promise<MutationResult<Inquiry>>
  accept(id: string, command: AcceptInquiryCommand): Promise<MutationResult<Inquiry>>
  reassign(id: string, command: ReassignInquiryCommand): Promise<MutationResult<Inquiry>>
  escalate(id: string, command: EscalateInquiryCommand): Promise<MutationResult<Inquiry>>
  markUnrouted(id: string, command: UnrouteInquiryCommand): Promise<MutationResult<Inquiry>>
  convert(id: string, command: CloseInquiryCommand): Promise<MutationResult<Inquiry>>
  markLost(id: string, command: CloseInquiryCommand): Promise<MutationResult<Inquiry>>
}
