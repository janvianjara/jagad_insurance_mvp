/**
 * Endorsement and cancellation — plan §8 ("P2 adds"), §9, FR-13, canvas n51-n56.
 *
 * One record carries the whole §9 path: the type that reshapes the form, the
 * delta or the refund, the claims-in-period verdict, and — on approval — the
 * immutable policy version that carries both endorsement numbers.
 *
 * Record-only money, twice over (D3). `delta` and `refund` are figures a person
 * read off the insurer's endorsement advice and typed. Nothing in this layer
 * subtracts the old premium from the new one, and nothing pro-rates a refund
 * across the unexpired term: `endorsementDeltaIsTyped` and
 * `refundIsTypedInsurerFigure` refuse a `derived` provenance, and the fixture
 * schema refuses one too, so a D3 violation cannot arrive as data either.
 *
 * The non-financial rule is §9's sharpest: "Non-financial types must render no
 * premium fields at all." Here that reads as both figures being `null` forever on
 * a non-financial endorsement — the fixture schema refuses a non-null one, and
 * `nonFinancialRendersNoPremiumFields` refuses the move that would write one. A
 * screen asks `premiumFieldsFor(type)` which fields it may render, and for a
 * non-financial endorsement the answer is an empty list.
 */

import type { Money } from '../../domain/money'
import type {
  AmountSource,
  ClaimsInPeriodVerdict,
  EndorsementState,
  EndorsementType,
} from '../../domain/workflows'
import type { ListQuery, Page, ReadRepository } from './query'
import type { MutationResult } from './result'

/**
 * One money figure on an endorsement, as recorded: the amount, where it came
 * from, and the insurer document it was read off. The reference sits beside the
 * amount for the same reason it does on a claim settlement — a figure with no
 * provenance is a figure somebody worked out.
 */
export type EndorsementFigure = {
  readonly amount: Money | null
  readonly source: AmountSource | null
  readonly insurerReference: string | null
}

/** Neither figure recorded. The only shape a non-financial endorsement may hold. */
export const NO_FIGURE: EndorsementFigure = { amount: null, source: null, insurerReference: null }

export type Endorsement = {
  readonly id: string
  /** `END-0031`. Always present, per §8's dual numbering. */
  readonly systemNo: string
  /** The insurer's own endorsement number. Absent until the company issues it. */
  readonly insurerEndorsementNo: string | null
  readonly policyId: string
  readonly customerId: string
  readonly type: EndorsementType
  readonly state: EndorsementState
  readonly ownerId: string | null
  readonly requestedAt: string
  readonly effectiveFrom: string | null
  /** Why the endorsement was raised, in the words of whoever raised it. */
  readonly reason: string
  /** The policy fields this endorsement changes. The scope guard reads these. */
  readonly changedFields: readonly string[]
  /** True when the change swaps the insured person or asset outright — §9 refuses it. */
  readonly replacesInsuredEntity: boolean
  /** Financial only. Null forever on a non-financial or a cancellation. */
  readonly delta: EndorsementFigure
  /** Cancellation only, and only when no claim fell inside the period. */
  readonly refund: EndorsementFigure
  /** What the claims-in-period check found. Null until a cancellation runs it. */
  readonly claimsVerdict: ClaimsInPeriodVerdict | null
  /** The immutable version written on approval. Null until `versionPolicy`. */
  readonly policyVersionId: string | null
  readonly documentId: string | null
  readonly approvedBy: string | null
  readonly approvedAt: string | null
}

/**
 * Raising one. The type is chosen up front because §9's initial state is
 * `type_selected` and every edge out of it forks on the type; the figures are
 * not, because none of them exists yet.
 */
export type CreateEndorsementCommand = {
  readonly actorId: string
  readonly policyId: string
  readonly customerId: string
  readonly type: EndorsementType
  readonly ownerId?: string | null
  readonly reason: string
  readonly effectiveFrom?: string
  readonly changedFields?: readonly string[]
  readonly replacesInsuredEntity?: boolean
  readonly now?: Date
}

/**
 * Moving off `type_selected` onto the type's own path. `renderedFields` is what
 * the form is actually showing, reported by the screen, so the non-financial
 * guard can refuse a premium field that is on screen but disabled.
 */
export type SelectEndorsementTypeCommand = {
  readonly actorId: string
  readonly renderedFields?: readonly string[]
  readonly changedFields?: readonly string[]
  /** What an endorsement may change here. Left out, only the outright-swap rule applies. */
  readonly permittedFields?: readonly string[]
  readonly replacesInsuredEntity?: boolean
  readonly now?: Date
}

/** The financial path. One edge: recording the delta submits the endorsement. */
export type RecordEndorsementDeltaCommand = {
  readonly actorId: string
  /** Typed from the insurer's endorsement advice. Never a difference of two premiums. */
  readonly delta: Money
  readonly source: AmountSource
  readonly insurerReference?: string
  readonly now?: Date
}

/** The cancellation path, clear of claims: the insurer's refund figure, typed. */
export type RecordEndorsementRefundCommand = {
  readonly actorId: string
  readonly refund: Money
  readonly source: AmountSource
  /** Which insurer document the figure was read off. §9 requires one. */
  readonly insurerReference: string
  readonly now?: Date
}

export type EndorsementStepCommand = {
  readonly actorId: string
  readonly note?: string
  readonly now?: Date
}

/**
 * The last move: `approved -> policy_versioned`. Both endorsement numbers are
 * required — §9 says the version carries ours and the insurer's, because both are
 * read aloud on the phone — and the version is written rather than edited.
 */
export type VersionPolicyCommand = {
  readonly actorId: string
  readonly insurerEndorsementNo: string
  readonly effectiveFrom: string
  readonly note: string
  readonly documentId?: string | null
  readonly now?: Date
}

export type EndorsementRepository = ReadRepository<Endorsement> & {
  bySystemNo(systemNo: string): Promise<Endorsement | null>
  forPolicy(policyId: string): Promise<readonly Endorsement[]>
  forCustomer(customerId: string): Promise<readonly Endorsement[]>
  queue(query?: ListQuery): Promise<Page<Endorsement>>
  /**
   * §9: "The claims-in-period check runs against the platform's own claim data
   * and returns instantly." A read, so a cancellation screen can show the verdict
   * before anybody presses anything.
   */
  claimsInPeriod(id: string): Promise<ClaimsInPeriodVerdict | null>

  create(command: CreateEndorsementCommand): Promise<MutationResult<Endorsement>>
  /** `type_selected -> non_financial | delta_entry | claims_check`, on the type. */
  selectType(id: string, command: SelectEndorsementTypeCommand): Promise<MutationResult<Endorsement>>
  /** Financial: `delta_entry -> submitted`, emitting the commission delta hook. */
  recordDelta(
    id: string,
    command: RecordEndorsementDeltaCommand,
  ): Promise<MutationResult<Endorsement>>
  /** Cancellation with a claim inside the period: `claims_check -> refund_not_eligible`. */
  blockRefund(id: string, command: EndorsementStepCommand): Promise<MutationResult<Endorsement>>
  /** Cancellation clear of claims: `claims_check -> refund_typed`. */
  recordRefund(
    id: string,
    command: RecordEndorsementRefundCommand,
  ): Promise<MutationResult<Endorsement>>
  submit(id: string, command: EndorsementStepCommand): Promise<MutationResult<Endorsement>>
  approve(id: string, command: EndorsementStepCommand): Promise<MutationResult<Endorsement>>
  /** Writes the new immutable `PolicyVersion` and moves to `policy_versioned`. */
  versionPolicy(id: string, command: VersionPolicyCommand): Promise<MutationResult<Endorsement>>
}
