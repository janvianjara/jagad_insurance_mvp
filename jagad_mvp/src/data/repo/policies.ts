/**
 * Contract — policies, their versions, the money story around them. Plan §8 and
 * D-A, canvas flow 3.
 *
 * `Policy` is classified, and the registry's field list is narrower than a policy
 * screen might expect: there is no `dealId`, no entry path, no draft progress. All
 * three belong to the act of entering a policy rather than to the policy itself,
 * so they live on `PolicyEntryDraft` — which is also what canvas 3.7 needs, since
 * "appears in the completion queue with missing fields" is a question about the
 * entry, not about the contract.
 *
 * Record-only money, in three places at once (D3):
 *   - `finalPremium` is typed from the insurer. `netPremium` and `gstAmount` are
 *     optional forever and Final is never derived from them by this layer.
 *   - `PremiumSchedule.instalmentAmount` is typed from the insurer's schedule.
 *     Nothing here divides an annual premium by twelve.
 *   - `Mandate` records that a mandate exists. The platform never initiates a
 *     debit and holds no bank credentials.
 */

import type { Money } from '../../domain/money'
import type {
  CollectionInstrument,
  CollectionMode,
  CollectionRoute,
  CollectionState,
  InstalmentAmountSource,
  InstalmentState,
  MandateState,
  PolicyEntryPath,
  PolicyState,
  PremiumMode,
  PremiumSource,
  ScheduleState,
} from '../../domain/workflows'
import type { ListQuery, Page, ReadRepository } from './query'
import type { MutationResult } from './result'

/** How far the money has got. Not a ledger — a status a queue can filter on. */
export const PAYMENT_STATES = {
  unpaid: 'unpaid',
  referenceRecorded: 'reference_recorded',
  collected: 'collected',
  verified: 'verified',
  partPaid: 'part_paid',
} as const

export type PaymentState = (typeof PAYMENT_STATES)[keyof typeof PAYMENT_STATES]

export type Policy = {
  readonly id: string
  readonly systemNo: string
  /** Present when the company has issued its own number. Absent forever is normal. */
  readonly insurerNo: string | null
  readonly customerId: string
  readonly companyId: string
  readonly productId: string
  readonly agencyId: string
  readonly agentId: string | null
  readonly subAgentId: string | null
  readonly status: PolicyState
  readonly startDate: string | null
  readonly expiryDate: string | null
  readonly sumInsured: Money | null
  /** Optional forever, per §9. Never required to issue, never used to derive Final. */
  readonly netPremium: Money | null
  readonly gstAmount: Money | null
  /** Typed from the insurer. Issue is gated on its presence, never on its value. */
  readonly finalPremium: Money | null
  readonly premiumMode: PremiumMode
  readonly paymentState: PaymentState
  readonly memberIds: readonly string[]
  readonly retentionClass: string
  /** The form-schema version this record was captured under, and renders under. */
  readonly schemaVersion: number
  readonly proposerBankAccount: string | null
  readonly nomineeAadhaarLast4: string | null
  readonly medicalReportSummary: string | null
}

/** Immutable history. A version is written, never edited. */
export type PolicyVersion = {
  readonly id: string
  readonly policyId: string
  readonly version: number
  readonly effectiveFrom: string
  readonly documentId: string | null
  readonly endorsementNo: string | null
  readonly insurerEndorsementNo: string | null
  readonly note: string
  readonly createdAt: string
}

/**
 * The act of entering a policy: which path it came in on, which deal it came
 * from, and — canvas 3.7 — what is still missing. A draft is a first-class record
 * so a half-finished entry is visible in a queue rather than lost in a form.
 */
export type PolicyEntryDraft = {
  readonly id: string
  readonly policyId: string
  readonly dealId: string | null
  readonly entryPath: PolicyEntryPath
  readonly formSchemaId: string
  readonly schemaVersion: number
  /** Field keys still empty. The completion queue sorts on the length of this. */
  readonly missingFields: readonly string[]
  readonly savedBy: string
  readonly savedAt: string
}

export type PremiumSchedule = {
  readonly id: string
  readonly policyId: string
  readonly state: ScheduleState
  readonly mode: PremiumMode
  /** Typed from the insurer's schedule. Never an annual premium divided by anything. */
  readonly instalmentAmount: Money | null
  readonly instalmentAmountSource: InstalmentAmountSource | null
  readonly instalmentCount: number
  readonly debitDay: number
  /** Grace for this mode, from config. Monthly commonly 15 days against 30 on annual. */
  readonly graceDays: number
  readonly startDate: string
  readonly createdAt: string
  readonly supersededByScheduleId: string | null
}

export type InstalmentDue = {
  readonly id: string
  readonly scheduleId: string
  readonly policyId: string
  readonly sequence: number
  readonly dueDate: string
  /** Comes from the schedule. Never computed per row. */
  readonly amount: Money
  readonly state: InstalmentState
  readonly collectionRecordId: string | null
  readonly paidAt: string | null
}

export const MANDATE_KINDS = {
  enach: 'enach',
  nach: 'nach',
  standingInstruction: 'standing_instruction',
} as const

export type MandateKind = (typeof MANDATE_KINDS)[keyof typeof MANDATE_KINDS]

/**
 * A mandate set up through the insurer's own link. We record that it exists and
 * what happened to it; we never present a debit and never hold a credential.
 */
export type Mandate = {
  readonly id: string
  readonly policyId: string
  readonly customerId: string
  readonly kind: MandateKind
  readonly reference: string
  readonly bankName: string
  readonly debitDay: number
  readonly validFrom: string
  readonly validUntil: string
  readonly state: MandateState
  readonly registeredBy: string
  readonly registeredAt: string
}

export type MandateEvent = {
  readonly id: string
  readonly mandateId: string
  readonly occurredAt: string
  readonly outcome: 'success' | 'failure'
  readonly reference: string
  /** The insurer's or bank's own words. Nothing is inferred from them. */
  readonly failureReason: string | null
}

export type CollectionRecord = {
  readonly id: string
  readonly policyId: string
  readonly customerId: string
  readonly agencyId: string | null
  readonly state: CollectionState
  readonly route: CollectionRoute
  readonly instrument: CollectionInstrument
  readonly mode: CollectionMode
  /** Typed by whoever recorded it, and null until they do. */
  readonly amount: Money | null
  readonly reference: string | null
  readonly collectedBy: string | null
  readonly collectedAt: string | null
  readonly verifiedBy: string | null
  readonly verifiedAt: string | null
  readonly bounceReason: string | null
  readonly instalmentId: string | null
}

export type IssuePolicyCommand = {
  readonly actorId: string
  /** Typed from the insurer's document. Presence is checked; the value is never produced. */
  readonly finalPremium: Money
  readonly finalPremiumSource: PremiumSource
  readonly netPremium?: Money
  readonly gstAmount?: Money
  readonly insurerNo?: string
  readonly startDate?: string
  readonly expiryDate?: string
  readonly now?: Date
}

export type PolicyStepCommand = {
  readonly actorId: string
  readonly note?: string
  readonly now?: Date
  /**
   * When this policy closed, for the retention lock. Left out, the adapter reads
   * it off the `policy.closed` event; a policy that closed before this store
   * existed has no closing date, and the machine refuses rather than guesses.
   */
  readonly closedAt?: string
}

export type DeclinePolicyCommand = PolicyStepCommand & {
  readonly declineReason: string
}

export type RecordCollectionCommand = {
  readonly actorId: string
  readonly amount: Money
  readonly route: CollectionRoute
  readonly instrument: CollectionInstrument
  readonly mode: CollectionMode
  readonly reference?: string
  readonly collectedBy: string
  readonly now?: Date
}

export type VerifyCollectionCommand = {
  readonly actorId: string
  readonly verifiedBy: string
  readonly verifierIsBackOffice: boolean
  readonly now?: Date
}

export type BounceCollectionCommand = {
  readonly actorId: string
  readonly bounceReason: string
  /** §9: the follow-up task is part of the same move, not a later nicety. */
  readonly followUpTaskCreated: true
  readonly followUpTaskDueOn: string
  readonly now?: Date
}

export type PolicyRepository = ReadRepository<Policy> & {
  bySystemNo(systemNo: string): Promise<Policy | null>
  forCustomer(customerId: string): Promise<readonly Policy[]>
  forHousehold(householdId: string): Promise<readonly Policy[]>
  /** Drafts and proposals still to be finished — canvas 3.7's completion queue. */
  completionQueue(query?: ListQuery): Promise<Page<PolicyEntryDraft>>
  draft(policyId: string): Promise<PolicyEntryDraft | null>
  versions(policyId: string): Promise<readonly PolicyVersion[]>
  /** Policies expiring inside the window. The renewals pool is built from this. */
  expiringBetween(from: string, to: string): Promise<readonly Policy[]>

  createProposal(id: string, command: PolicyStepCommand): Promise<MutationResult<Policy>>
  sendProposal(id: string, command: PolicyStepCommand): Promise<MutationResult<Policy>>
  issue(id: string, command: IssuePolicyCommand): Promise<MutationResult<Policy>>
  decline(id: string, command: DeclinePolicyCommand): Promise<MutationResult<Policy>>
  dispatch(id: string, command: PolicyStepCommand): Promise<MutationResult<Policy>>
  collectDocuments(id: string, command: PolicyStepCommand): Promise<MutationResult<Policy>>
  close(id: string, command: PolicyStepCommand): Promise<MutationResult<Policy>>
  /** Retention lock. The alternative to deletion is waiting, per §9. */
  lock(id: string, command: PolicyStepCommand): Promise<MutationResult<Policy>>
}

export type PremiumScheduleRepository = {
  forPolicy(policyId: string): Promise<PremiumSchedule | null>
  instalments(scheduleId: string): Promise<readonly InstalmentDue[]>
  /** Instalments due or in grace at `at`. The other clock, distinct from expiry. */
  dueBetween(from: string, to: string): Promise<readonly InstalmentDue[]>
  mandate(policyId: string): Promise<Mandate | null>
  mandateEvents(mandateId: string): Promise<readonly MandateEvent[]>
}

export type CollectionRepository = ReadRepository<CollectionRecord> & {
  forPolicy(policyId: string): Promise<readonly CollectionRecord[]>
  record(id: string, command: RecordCollectionCommand): Promise<MutationResult<CollectionRecord>>
  verify(id: string, command: VerifyCollectionCommand): Promise<MutationResult<CollectionRecord>>
  markBounced(id: string, command: BounceCollectionCommand): Promise<MutationResult<CollectionRecord>>
  close(id: string, command: PolicyStepCommand): Promise<MutationResult<CollectionRecord>>
}
