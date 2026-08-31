/**
 * Demand — quotations and their lines. Plan §8, canvas flow 2.
 *
 * The registry classifies `Quotation`, and it classifies a header: one version,
 * one status, the company and product ids, the benefit rows, one final payable
 * premium. The comparison matrix itself is a second entity, `QuotationLine` —
 * §8's "QuotationLine" — because a column carries its own typed Final Payable
 * Premium and a header field cannot hold three of those.
 *
 * `Quotation.finalPayablePremium` is therefore the figure of the column the
 * customer accepted, present only once the quotation is won. It is typed, like
 * every other figure in this platform.
 *
 * Prior versions stay readable by keeping their lines: a line carries the version
 * it belongs to and is never rewritten, so v1 renders exactly as it was sent
 * after v2 opens.
 */

import type { AmendCommand, Discardable, DiscardCommand, RestoreCommand } from '../../domain/amend'
import type { Money } from '../../domain/money'
import type { PremiumMode, PremiumSource, QuotationState } from '../../domain/workflows'
import type { ListQuery, Page, ReadRepository } from './query'
import type { MutationResult } from './result'

/**
 * One row of the matrix. `adHoc` marks canvas 2.2's inline addition: it appears
 * on this quotation only and the benefit catalogue is left untouched, which is
 * why the row carries its own label and a nullable catalogue id.
 */
export type QuotationBenefitRow = {
  readonly key: string
  readonly benefitItemId: string | null
  readonly label: string
  readonly adHoc: boolean
  readonly sortOrder: number
}

export type QuotationLine = {
  readonly id: string
  readonly quotationId: string
  readonly version: number
  /** Stable across versions, so v1 and v2 columns line up when compared. */
  readonly columnKey: string
  readonly label: string
  readonly companyId: string
  readonly productId: string
  /** Absent until somebody types the insurer's figure. Absent is a real state. */
  readonly finalPayablePremium: Money | null
  readonly finalPremiumSource: PremiumSource | null
  /**
   * The typed components behind the final figure, when the insurer's quote broke
   * them out. Optional forever, per §9 — nothing is gated on them and Final is
   * never derived from them. They exist so a deal can roll the accepted columns
   * up the only way this platform allows: Net as the sum of typed parts, Final as
   * Net plus the typed GST.
   */
  readonly netPremium: Money | null
  readonly gstAmount: Money | null
  /** Benefit row key to the typed value shown in this column. */
  readonly benefitValues: Readonly<Record<string, string>>
  /** Set when a newer version supersedes this line's version. */
  readonly locked: boolean
}

export type Quotation = Discardable & {
  readonly id: string
  readonly systemNo: string
  readonly version: number
  readonly status: QuotationState
  readonly customerId: string
  readonly inquiryId: string | null
  readonly ownerId: string
  readonly agentId: string | null
  /**
   * The sub-agent the business came through. The inquiry has always carried one
   * and the quotation used to drop it, which left the deal with no rung to read
   * a sub-agent off and the commission chain with half an arrangement.
   */
  readonly subAgentId: string | null
  readonly companyIds: readonly string[]
  readonly productIds: readonly string[]
  readonly benefitRows: readonly QuotationBenefitRow[]
  readonly premiumMode: PremiumMode
  /** The accepted column's typed figure, once there is one. */
  readonly finalPayablePremium: Money | null
  readonly sharedAt: string | null
  /** The columns the customer accepted. Empty until the award is recorded. */
  readonly acceptedColumnKeys: readonly string[]
  readonly awardedAt: string | null
  readonly revisionReason: string | null
  readonly lostReason: string | null
  readonly createdAt: string
  readonly documentId: string | null
}

/**
 * Opening a quotation — canvas 2.1, the step before the matrix exists.
 *
 * No columns and no benefit rows: a quotation is born in `draft`, and `compose`
 * is where the matrix arrives and where the machine starts caring about typed
 * premiums. Nothing here carries an amount, because at this point there is none
 * and the platform will not invent one.
 */
export type CreateQuotationCommand = {
  readonly actorId: string
  readonly customerId: string
  readonly ownerId: string
  /** The inquiry this came out of, when it came out of one. */
  readonly inquiryId?: string | null
  readonly agentId?: string | null
  readonly subAgentId?: string | null
  readonly premiumMode: PremiumMode
  readonly now?: Date
}

export type ComposeQuotationCommand = {
  readonly actorId: string
  readonly benefitRows: readonly QuotationBenefitRow[]
  readonly lines: readonly Omit<QuotationLine, 'id' | 'quotationId' | 'version' | 'locked'>[]
  readonly now?: Date
}

export type GenerateQuotationCommand = {
  readonly actorId: string
  readonly documentId?: string
  readonly now?: Date
}

export type ShareQuotationCommand = {
  readonly actorId: string
  readonly channel?: string
  readonly now?: Date
}

export type ReviseQuotationCommand = {
  readonly actorId: string
  readonly revisionReason: string
  readonly now?: Date
}

/**
 * The revised version's columns, typed afresh. The old lines are locked, not
 * edited — a revision opens v+1, it never overwrites what the customer saw.
 */
export type RegenerateQuotationCommand = GenerateQuotationCommand & {
  readonly revisionReason: string
  readonly lines: readonly Omit<QuotationLine, 'id' | 'quotationId' | 'version' | 'locked'>[]
}

/**
 * Recording the customer's decision — the state that used to be a guardless hop.
 *
 * The accepted columns are required. Which columns were bought is the entire
 * content of the decision, and a quotation that reached `won` without them left
 * every downstream consumer guessing.
 */
export type AwardQuotationCommand = {
  readonly actorId: string
  readonly acceptedColumnKeys: readonly string[]
  readonly now?: Date
}

export type VoidAwardCommand = {
  readonly actorId: string
  readonly awardVoidReason: string
  readonly now?: Date
}

export type CloseQuotationCommand = {
  readonly actorId: string
  /** The application this award produced. `won` is not reachable without one. */
  readonly dealId?: string
  readonly lostReason?: string
  readonly now?: Date
}

export type QuotationRepository = ReadRepository<Quotation> & {
  bySystemNo(systemNo: string): Promise<Quotation | null>
  forCustomer(customerId: string, query?: ListQuery): Promise<Page<Quotation>>
  /**
   * The quotations raised off one inquiry. The forward link has always existed as
   * `Quotation.inquiryId`; without this read, an inquiry could not say what came
   * of it without scanning every quotation on the books.
   */
  forInquiry(inquiryId: string): Promise<readonly Quotation[]>
  /** The live version's columns. */
  lines(quotationId: string): Promise<readonly QuotationLine[]>
  /** Every column ever, including locked ones, so prior versions stay viewable. */
  allLines(quotationId: string): Promise<readonly QuotationLine[]>

  /** Opens a quotation in `draft` at version 1, numbered. */
  create(command: CreateQuotationCommand): Promise<MutationResult<Quotation>>
  compose(id: string, command: ComposeQuotationCommand): Promise<MutationResult<Quotation>>
  generate(id: string, command: GenerateQuotationCommand): Promise<MutationResult<Quotation>>
  share(id: string, command: ShareQuotationCommand): Promise<MutationResult<Quotation>>
  requestRevision(id: string, command: ReviseQuotationCommand): Promise<MutationResult<Quotation>>
  regenerate(id: string, command: RegenerateQuotationCommand): Promise<MutationResult<Quotation>>
  /** Records the decision. Nothing is placed and no application exists yet. */
  markAwarded(id: string, command: AwardQuotationCommand): Promise<MutationResult<Quotation>>
  /** Reverses an award before placement. The quotation goes back to `shared`. */
  voidAward(id: string, command: VoidAwardCommand): Promise<MutationResult<Quotation>>
  markWon(id: string, command: CloseQuotationCommand): Promise<MutationResult<Quotation>>
  markLost(id: string, command: CloseQuotationCommand): Promise<MutationResult<Quotation>>

  /**
   * Corrects the header's prose and its attribution — `AMEND_POLICIES.Quotation`.
   * The matrix is not correctable here: a column's typed premium is what the
   * insurer quoted, and changing what was quoted is a revision, which opens v+1
   * and leaves v readable exactly as it was sent.
   */
  amend(id: string, command: AmendCommand): Promise<MutationResult<Quotation>>
  /**
   * Removes a quotation raised against the wrong customer. Refused once the
   * award has been recorded, because an award is what an application is opened
   * against.
   */
  discard(id: string, command: DiscardCommand): Promise<MutationResult<Quotation>>
  restore(id: string, command: RestoreCommand): Promise<MutationResult<Quotation>>
}
