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
  /** Benefit row key to the typed value shown in this column. */
  readonly benefitValues: Readonly<Record<string, string>>
  /** Set when a newer version supersedes this line's version. */
  readonly locked: boolean
}

export type Quotation = {
  readonly id: string
  readonly systemNo: string
  readonly version: number
  readonly status: QuotationState
  readonly customerId: string
  readonly inquiryId: string | null
  readonly ownerId: string
  readonly agentId: string | null
  readonly companyIds: readonly string[]
  readonly productIds: readonly string[]
  readonly benefitRows: readonly QuotationBenefitRow[]
  readonly premiumMode: PremiumMode
  /** The accepted column's typed figure, once there is one. */
  readonly finalPayablePremium: Money | null
  readonly sharedAt: string | null
  readonly revisionReason: string | null
  readonly lostReason: string | null
  readonly createdAt: string
  readonly documentId: string | null
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

export type CloseQuotationCommand = {
  readonly actorId: string
  /** Which column the customer accepted. Its typed figure becomes the header figure. */
  readonly acceptedColumnKey?: string
  readonly lostReason?: string
  readonly now?: Date
}

export type QuotationRepository = ReadRepository<Quotation> & {
  bySystemNo(systemNo: string): Promise<Quotation | null>
  forCustomer(customerId: string, query?: ListQuery): Promise<Page<Quotation>>
  /** The live version's columns. */
  lines(quotationId: string): Promise<readonly QuotationLine[]>
  /** Every column ever, including locked ones, so prior versions stay viewable. */
  allLines(quotationId: string): Promise<readonly QuotationLine[]>

  compose(id: string, command: ComposeQuotationCommand): Promise<MutationResult<Quotation>>
  generate(id: string, command: GenerateQuotationCommand): Promise<MutationResult<Quotation>>
  share(id: string, command: ShareQuotationCommand): Promise<MutationResult<Quotation>>
  requestRevision(id: string, command: ReviseQuotationCommand): Promise<MutationResult<Quotation>>
  regenerate(id: string, command: RegenerateQuotationCommand): Promise<MutationResult<Quotation>>
  markWon(id: string, command: CloseQuotationCommand): Promise<MutationResult<Quotation>>
  markLost(id: string, command: CloseQuotationCommand): Promise<MutationResult<Quotation>>
}
