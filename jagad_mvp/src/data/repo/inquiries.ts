/**
 * Demand — inquiries. Plan §8, canvas flow 1.
 *
 * `Inquiry` is one of the seven classified entities, so its fields are exactly
 * the registry's. Note what that excludes: there is no free-form status string
 * here, `status` is the `InquiryState` union, and every move to a new one goes
 * through `inquiryMachine` in the adapter below. The TAT that machine reads comes
 * from the category's routing recipe, never from a constant.
 */

import type { AmendCommand, Discardable, DiscardCommand, RestoreCommand } from '../../domain/amend'
import type { InquiryAssignment, InquiryState } from '../../domain/workflows'
import type { Activity, ActivityChannel, ActivityDirection } from './activities'
import type { Task, TaskKind } from './tasks'
import type { CustomerSource } from './customers'
import type { ListQuery, Page, ReadRepository } from './query'
import type { MutationResult } from './result'

/**
 * Who sent this lead our way — the subject `source: 'referral'` never had.
 *
 * `referral` was a value in `CUSTOMER_SOURCES` with nothing on the other end of
 * it, so a referred lead could be counted but not attributed, thanked or paid.
 * The four kinds are the four things a referrer actually is here: an existing
 * customer, a sub-agent, somebody on staff, or a person outside the system whose
 * name is all we have.
 */
export const REFERRER_KINDS = {
  customer: 'customer',
  subAgent: 'sub_agent',
  staff: 'staff',
  external: 'external',
} as const

export type ReferrerKind = (typeof REFERRER_KINDS)[keyof typeof REFERRER_KINDS]

export type ReferralAttribution = {
  readonly kind: ReferrerKind
  /** The record referred from. Null only when the referrer is external. */
  readonly referrerId: string | null
  /** A name and nothing else. Set only when the referrer is external. */
  readonly referrerName: string | null
  readonly capturedAt: string
}

export type Inquiry = Discardable & {
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
  /**
   * Set when and only when `source` is `referral`. The biconditional is enforced
   * at `create` and asserted across the fixtures: a referral with no referrer is
   * a claim nobody can act on, and a referrer on a walk-in is a claim nobody
   * made.
   */
  readonly referral: ReferralAttribution | null
  readonly contactName: string
  readonly contactMobile: string
  readonly contactEmail: string | null
  readonly notes: string | null

  /* --- engagement, FR-06.12 to .17. See §9 "Inquiry engagement". ------------ */

  /**
   * Where this inquiry sits inside `accepted`, as an `InquiryStage` key.
   *
   * Null until somebody has actually made contact, which is information rather
   * than a gap: an accepted inquiry with no stage is one nobody has spoken to
   * yet, and that is exactly the population the engagement layer exists to
   * surface. The lifecycle `status` above is untouched by any of this.
   */
  readonly stageKey: string | null
  readonly stageEnteredAt: string | null
  /** How many times contact was attempted without connecting. */
  readonly contactAttempts: number
  /** The last time anybody actually spoke to them. Drives the ageing reports. */
  readonly lastActivityAt: string | null
  /**
   * When the next thing happens. FR-06.15: an open inquiry may not be without
   * one, and the KPI that replaces "% confirmed within TAT" counts exactly this
   * field being present.
   */
  readonly nextActionAt: string | null
}

/**
 * What the person taking the call supplies — canvas 1.6, where a name and a
 * mobile number alone are enough to get an inquiry on the books.
 *
 * There is no `systemNo` and no `status`: the repository numbers the record and
 * the machine's initial state is the only state it can be born in. There is no
 * `ownerId` either — routing assigns, and an inquiry that arrives pre-owned has
 * skipped the recipe that decides who owns it.
 */
export type CreateInquiryCommand = {
  readonly actorId: string
  readonly contactName: string
  readonly contactMobile: string
  readonly source: CustomerSource
  readonly categoryId?: string | null
  readonly customerId?: string | null
  /**
   * Required when `source` is `referral`, refused otherwise. `capturedAt` is
   * not supplied — the repository stamps it, the way it numbers the record.
   */
  readonly referral?: {
    readonly kind: ReferrerKind
    readonly referrerId?: string | null
    readonly referrerName?: string | null
  } | null
  readonly agentId?: string | null
  readonly subAgentId?: string | null
  readonly contactEmail?: string | null
  readonly notes?: string | null
  readonly productInterest?: readonly string[]
  readonly now?: Date
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

/**
 * One contact, recorded — FR-06.13 to .17.
 *
 * This is deliberately one call rather than four. Logging the activity, raising
 * the follow-up task, moving the stage and stamping the inquiry are a single
 * business act, and splitting them across the screen would put FR-06.15's
 * mandate in the screen's hands: any other caller could then log a contact and
 * leave the inquiry with no next action, which is the exact state the mandate
 * exists to abolish. So the rule lives under the write, and a refusal writes
 * nothing at all — no activity, no task, no stamp.
 *
 * `nextAction` is absent when the disposition is terminal and required
 * otherwise; which of those applies is read off the configured disposition, not
 * decided here.
 */
export type LogEngagementCommand = {
  readonly actorId: string
  readonly channel: ActivityChannel
  readonly direction: ActivityDirection
  /** A key from the configured disposition list. */
  readonly dispositionKey: string
  readonly occurredAt?: string
  readonly notes?: string | null
  /** Required unless the disposition closes the inquiry. */
  readonly nextAction?: {
    readonly kind: TaskKind
    readonly dueAt: string
    readonly note?: string
    readonly assigneeId?: string
  } | null
  /** Compulsory for the dispositions that say so — Lost, and a wrong number. */
  readonly reason?: string | null
  readonly messageLogId?: string | null
  readonly now?: Date
}

/** What one engagement produced, so a screen can show all of it at once. */
export type EngagementOutcome = {
  readonly inquiry: Inquiry
  readonly activity: Activity
  /** The follow-up raised, when the disposition asked for one. */
  readonly task: Task | null
}

/**
 * Bringing a parked lead back — FR-06.17.
 *
 * Dormancy has to have a way out or it is Lost with a friendlier name, and a
 * pipeline whose only exit is Lost destroys the win-back list the agency would
 * work next quarter. Recycling puts the inquiry back where somebody can pick it
 * up: it re-enters the pipeline unstaged, which is honestly what it is — a lead
 * nobody has spoken to lately.
 *
 * `reason` is required. A lead coming back off the parked list is a decision
 * somebody made, and the trail should say which.
 */
export type RecycleInquiryCommand = {
  readonly actorId: string
  readonly reason: string
  /** Hands it back to the pool. Omitted leaves it with its current owner. */
  readonly toPool?: boolean
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
  /**
   * Everything one referrer has sent us — FR-06.2's other half.
   *
   * Recording who referred a lead and being able to ask what somebody has
   * referred are two capabilities, and only the first is a field. Matches on the
   * id whatever kind of referrer it is, so one call answers the question for a
   * customer, a sub-agent and a staff member alike.
   */
  referredBy(referrerId: string, query?: ListQuery): Promise<Page<Inquiry>>
  /** Every inquiry whose TAT has already run out at `at`. Feeds the escalation sweep. */
  breachingTat(at: Date, query?: ListQuery): Promise<Page<Inquiry>>

  /** Records a new inquiry in `new`, numbered and ready for routing. */
  create(command: CreateInquiryCommand): Promise<MutationResult<Inquiry>>
  /**
   * Records one contact and everything that follows from it. See
   * `LogEngagementCommand` for why this is a single call.
   */
  logEngagement(id: string, command: LogEngagementCommand): Promise<MutationResult<EngagementOutcome>>
  /** Every inquiry whose next action is dated before `at`. Feeds the nudge sweep. */
  nextActionOverdue(at: Date, query?: ListQuery): Promise<Page<Inquiry>>
  /** The parked leads, for the win-back list. */
  dormant(query?: ListQuery): Promise<Page<Inquiry>>
  /** Brings a parked lead back into the pipeline. */
  recycle(id: string, command: RecycleInquiryCommand): Promise<MutationResult<Inquiry>>
  assign(id: string, command: AssignInquiryCommand): Promise<MutationResult<Inquiry>>
  accept(id: string, command: AcceptInquiryCommand): Promise<MutationResult<Inquiry>>
  reassign(id: string, command: ReassignInquiryCommand): Promise<MutationResult<Inquiry>>
  escalate(id: string, command: EscalateInquiryCommand): Promise<MutationResult<Inquiry>>
  markUnrouted(id: string, command: UnrouteInquiryCommand): Promise<MutationResult<Inquiry>>
  convert(id: string, command: CloseInquiryCommand): Promise<MutationResult<Inquiry>>
  markLost(id: string, command: CloseInquiryCommand): Promise<MutationResult<Inquiry>>

  /**
   * Corrects what was taken down wrong — FR-20.4.
   *
   * The allow-list is `AMEND_POLICIES.Inquiry` in `src/domain/amend.ts` and it is
   * the contact block plus the attribution, which is exactly what gets mistyped
   * on a phone call. Anything else refuses with a sentence saying why. Every
   * accepted correction emits `record.amended`, so the trail says who changed
   * what and on what grounds.
   */
  amend(id: string, command: AmendCommand): Promise<MutationResult<Inquiry>>
  /**
   * Takes a duplicate or a wrong number out of the queues without taking it out
   * of the book. Soft and reversible: the row keeps its number, leaves every
   * list by default and comes back through `restore`. An inquiry that has
   * already converted is refused, because something downstream points at it.
   */
  discard(id: string, command: DiscardCommand): Promise<MutationResult<Inquiry>>
  restore(id: string, command: RestoreCommand): Promise<MutationResult<Inquiry>>
}
