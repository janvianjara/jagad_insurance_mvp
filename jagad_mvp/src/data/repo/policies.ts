/**
 * Contract — policies, their versions, the money story around them. Plan §8 and
 * D-A, canvas flow 3.
 *
 * `Policy` is classified, and the registry's field list is narrower than a policy
 * screen might expect: there is no entry path and no draft progress. Both belong
 * to the act of entering a policy rather than to the policy itself, so they live
 * on `PolicyEntryDraft` — which is also what canvas 3.7 needs, since "appears in
 * the completion queue with missing fields" is a question about the entry, not
 * about the contract.
 *
 * `provenance` is the one that changed sides. Where a policy *came from* was
 * originally read the same way — a fact about the entry — and kept as a nullable
 * `dealId` on the draft. Renewal is what settles the argument the other way: a
 * renewal's predecessor is not a detail of how somebody typed the record, it is
 * a property of the contract, and a book loaded from a spreadsheet has to be able
 * to say "no upstream exists" out loud rather than leave a null to be guessed at.
 * So origin sits on `Policy`, as a union whose wrong shapes are unconstructable.
 *
 * It is a different axis from `entryPath`, and the two are deliberately not
 * merged: `entryPath` says whether a proposal was raised or an already-issued
 * document was back-entered, `provenance` says what the policy came out of. A
 * renewal can arrive down either path.
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

/* --------------------------------------------------------------- provenance */

export const POLICY_ORIGINS = {
  /** Won from a deal, which came from a quotation, which may have come from an inquiry. */
  deal: 'deal',
  /** Renews a policy this platform already holds. */
  renewal: 'renewal',
  /** Entered straight against a customer. Real, and common: not every policy is quoted. */
  captured: 'captured',
  /** Loaded from whatever the agency kept the book in before. */
  migrated: 'migrated',
} as const

export type PolicyOrigin = (typeof POLICY_ORIGINS)[keyof typeof POLICY_ORIGINS]

/**
 * Where a contract came from, as a union rather than four nullable columns.
 *
 * The shapes that would be wrong are unconstructable: a captured policy cannot
 * carry a `dealId`, and a renewal cannot omit its predecessor. Four nullable
 * fields would permit all sixteen combinations and leave every reader to work
 * out which four were meant.
 *
 * `migrated` earns its place by being the honest branch. A back-loaded book has
 * no upstream, and saying so is different from three nulls that might mean the
 * link is missing, or unknown, or simply not looked up yet.
 */
export type PolicyProvenance =
  | { readonly origin: 'deal'; readonly dealId: string }
  | { readonly origin: 'renewal'; readonly precedingPolicyId: string }
  | { readonly origin: 'captured'; readonly reason: string }
  | { readonly origin: 'migrated'; readonly batchRef: string }

/** The deal behind a policy, or null where there is honestly none. */
export function dealIdOf(provenance: PolicyProvenance): string | null {
  return provenance.origin === POLICY_ORIGINS.deal ? provenance.dealId : null
}

/** The policy this one renews, or null. */
export function precedingPolicyIdOf(provenance: PolicyProvenance): string | null {
  return provenance.origin === POLICY_ORIGINS.renewal ? provenance.precedingPolicyId : null
}

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
  /** What this contract came out of. Required: every policy came from somewhere. */
  readonly provenance: PolicyProvenance
  /** The form-schema version this record was captured under, and renders under. */
  readonly schemaVersion: number
  readonly proposerBankAccount: string | null
  readonly nomineeAadhaarLast4: string | null
  readonly medicalReportSummary: string | null
}

/* ------------------------------------------------------ itemised premium */

/**
 * One typed component of a policy's premium, kept as it was recorded.
 *
 * The keys are not enumerated here on purpose. They come from the product form's
 * own roll-up definition, which `premiumShapeOf` already reads — motor yields
 * own damage, third party and add-ons; life yields base, extra mortality and
 * riders; health yields base and loading. Adding a line adds rows, not code.
 *
 * D3 is unchanged by storing these, and the distinction is worth stating because
 * it is the one a reviewer should check. `Policy.netPremium` stays a *typed*
 * figure. Nothing sums these components into it. The sum is rendered beside it by
 * `<RollUp>`, as the same cross-check the entry screen showed, and when the two
 * disagree the screen says so rather than choosing one.
 *
 * `label` is stored rather than looked up so history reads the way it read at the
 * time: a schema that renames "Add-on premium" later must not silently relabel
 * what somebody signed off two years ago.
 */
export type PolicyPremiumComponent = {
  readonly id: string
  readonly policyId: string
  /** The form-schema field key this figure was typed into. */
  readonly key: string
  /** The label as shown when it was recorded. */
  readonly label: string
  /** Integer paise, exactly as typed. `null` is unrecorded, which is not zero. */
  readonly amount: Money | null
  /** The schema version the key was defined under. */
  readonly schemaVersion: number
  /** Where in the block it sat, so the record renders in the order it was entered. */
  readonly sortOrder: number
  readonly recordedBy: string
  readonly recordedAt: string
}

export const NCB_SOURCES = {
  previousInsurer: 'previous_insurer',
  declaredByCustomer: 'declared_by_customer',
  notApplicable: 'not_applicable',
} as const

export type NcbSource = (typeof NCB_SOURCES)[keyof typeof NCB_SOURCES]

/**
 * No-claim bonus. A percentage, never money.
 *
 * It is recorded because the next renewal has to carry it forward and because a
 * claim decision turns on it, and it lives in basis points as an integer so no
 * float ever touches a rate. The platform never applies it to anything: a bonus
 * that reduced a premium reduced it on the insurer's system, and the figure that
 * came back is the one somebody typed.
 */
export type PolicyNcb = {
  readonly id: string
  readonly policyId: string
  /** Basis points. 50% is 5000. */
  readonly percentBp: number
  readonly source: NcbSource
  /** The policy this bonus was carried from, when it was carried from one. */
  readonly carriedFromPolicyId: string | null
  readonly recordedBy: string
  readonly recordedAt: string
}

/* ------------------------------------------------------------------ dispatch */

export const DISPATCH_CHANNELS = {
  ePolicyEmail: 'e_policy_email',
  ePolicyWhatsapp: 'e_policy_whatsapp',
  courier: 'courier',
  handedOver: 'handed_over',
} as const

export type DispatchChannel = (typeof DISPATCH_CHANNELS)[keyof typeof DISPATCH_CHANNELS]

export const DELIVERY_STATES = {
  pending: 'pending',
  inTransit: 'in_transit',
  delivered: 'delivered',
  returned: 'returned',
  confirmedByCustomer: 'confirmed_by_customer',
} as const

export type DeliveryState = (typeof DELIVERY_STATES)[keyof typeof DELIVERY_STATES]

/**
 * One dispatch of one policy document — §5's "dispatch" on the policy record.
 *
 * A policy has several of these rather than one row overwritten, because "we
 * emailed the e-policy on the day of issue and the courier brought the physical
 * copy back a week later" is a sentence the record has to be able to make. A
 * single mutable status field could only tell the second half.
 *
 * Delivery and confirmation are kept apart on purpose. `delivered` is what the
 * courier says; `confirmed_by_customer` is what the customer says, and only the
 * second is evidence when a policyholder later says the document never arrived.
 * The platform never infers one from the other.
 *
 * The recipient's contact is stored masked. A dispatch log is read by anybody
 * who can see the policy, and a full mobile number sitting in a delivery row is
 * a wider surface than the record needs.
 */
export type PolicyDispatch = {
  readonly id: string
  readonly policyId: string
  readonly channel: DispatchChannel
  /** The document that went out. Null while it is recorded but not yet attached. */
  readonly documentId: string | null
  readonly state: DeliveryState
  readonly recipientName: string
  /** Masked at rest and at render — never the full number. */
  readonly recipientContactMasked: string
  /** Courier only. Null on every electronic channel. */
  readonly courierName: string | null
  readonly trackingRef: string | null
  readonly dispatchedBy: string
  readonly dispatchedAt: string
  readonly deliveredAt: string | null
  /** Set only when a person recorded that the customer confirmed receipt. */
  readonly confirmedAt: string | null
  readonly confirmedBy: string | null
  /** The courier's own words when it came back. Nothing is inferred from them. */
  readonly returnReason: string | null
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

/**
 * Entering a policy — canvas 3.6 and 3.7.
 *
 * The command carries the entry as well as the contract, because `PolicyEntryDraft`
 * is written by the same act: the path, the deal it came from, the schema it was
 * captured under and what is still missing are facts about the entry, and
 * `issue` later reads the path back off that draft. A create that wrote only the
 * policy would leave a direct entry looking like a proposal.
 *
 * The amounts are optional and are recorded exactly as typed. None of them is
 * required to create, none is derived from another, and `finalPremium` is still
 * checked by `finalPremiumPresentAndTyped` at issue — a policy entered without one
 * is an ordinary half-finished entry, which is what the completion queue is for.
 *
 * `insurerNo` is absent: the company's own number arrives later, through `issue`.
 */
export type CreatePolicyCommand = {
  readonly actorId: string
  readonly customerId: string
  readonly companyId: string
  readonly productId: string
  readonly agencyId: string
  readonly agentId?: string | null
  readonly subAgentId?: string | null
  readonly entryPath: PolicyEntryPath
  /**
   * What this contract came out of. Required, and the *only* place the deal is
   * named: `PolicyEntryDraft.dealId` is written from this by the same act, so
   * there is one input for one fact rather than two that can disagree.
   */
  readonly provenance: PolicyProvenance
  readonly formSchemaId: string
  readonly schemaVersion: number
  /** Field keys still empty, straight off the form. The queue sorts on the count. */
  readonly missingFields?: readonly string[]
  readonly savedBy: string
  readonly premiumMode: PremiumMode
  readonly retentionClass: string
  readonly memberIds?: readonly string[]
  readonly startDate?: string
  readonly expiryDate?: string
  readonly sumInsured?: Money
  readonly netPremium?: Money
  readonly gstAmount?: Money
  readonly finalPremium?: Money
  /**
   * The typed parts, in the order the block showed them. Optional forever — §9
   * says components never gate issue, and persisting them must not change that.
   * An unrecorded component is passed with a `null` amount rather than omitted,
   * because "nobody typed this" is a fact the record should carry.
   */
  readonly components?: readonly PremiumComponentInput[]
  readonly ncb?: NcbInput
  readonly now?: Date
}

/** One component as a person left it. `null` is unrecorded, never zero. */
export type PremiumComponentInput = {
  readonly key: string
  readonly label: string
  readonly amount: Money | null
}

export type NcbInput = {
  readonly percentBp: number
  readonly source: NcbSource
  readonly carriedFromPolicyId?: string | null
}

export type IssuePolicyCommand = {
  readonly actorId: string
  /** Typed from the insurer's document. Presence is checked; the value is never produced. */
  readonly finalPremium: Money
  readonly finalPremiumSource: PremiumSource
  readonly netPremium?: Money
  readonly gstAmount?: Money
  /** Re-typed off the issued document when it itemises differently from the proposal. */
  readonly components?: readonly PremiumComponentInput[]
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

/**
 * Sending the document out — FR-10.9.
 *
 * This is an outward move: something leaves the agency and reaches a customer.
 * It therefore carries who it went to and how, rather than only moving the
 * policy's state, and the screen puts it behind `<ConfirmGate>` for the same
 * reason every other outward mutation is gated.
 */
export type DispatchPolicyCommand = PolicyStepCommand & {
  readonly channel: DispatchChannel
  readonly recipientName: string
  readonly recipientContactMasked: string
  readonly documentId?: string | null
  /** Required by the screen for a courier, and meaningless without one. */
  readonly courierName?: string | null
  readonly trackingRef?: string | null
}

/** Recording what became of a dispatch. Delivery and confirmation stay separate. */
export type RecordDeliveryCommand = {
  readonly actorId: string
  readonly state: DeliveryState
  /** The courier's reason, required when the state is `returned`. */
  readonly returnReason?: string
  readonly now?: Date
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

  /** The typed parts of the premium, in the order they were recorded. */
  premiumComponents(policyId: string): Promise<readonly PolicyPremiumComponent[]>
  ncb(policyId: string): Promise<PolicyNcb | null>

  /**
   * The reverse of `provenance`. Deal to policy completes the spine's last hop,
   * which until now could only be walked forwards off `Deal.consumedByPolicyId`
   * — a field that answers "was this deal used" rather than "what came of it".
   */
  forDeal(dealId: string): Promise<readonly Policy[]>
  /** The policies that renewed this one. Ordinarily one; occasionally none. */
  renewalsOf(policyId: string): Promise<readonly Policy[]>

  /**
   * Enters a policy in `draft` with its entry draft beside it. An unissued policy
   * numbers under `POL-DRAFT`; a direct entry, which is a policy the insurer has
   * already issued, numbers under `POL` (§8).
   */
  create(command: CreatePolicyCommand): Promise<MutationResult<Policy>>
  createProposal(id: string, command: PolicyStepCommand): Promise<MutationResult<Policy>>
  sendProposal(id: string, command: PolicyStepCommand): Promise<MutationResult<Policy>>
  issue(id: string, command: IssuePolicyCommand): Promise<MutationResult<Policy>>
  decline(id: string, command: DeclinePolicyCommand): Promise<MutationResult<Policy>>
  /** Moves the policy to `dispatched` and writes the delivery row in one act. */
  dispatch(id: string, command: DispatchPolicyCommand): Promise<MutationResult<Policy>>
  /** Every dispatch of this policy, newest last. */
  dispatches(policyId: string): Promise<readonly PolicyDispatch[]>
  /** What became of one dispatch. Never inferred from the passage of time. */
  recordDelivery(
    dispatchId: string,
    command: RecordDeliveryCommand,
  ): Promise<MutationResult<PolicyDispatch>>
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
