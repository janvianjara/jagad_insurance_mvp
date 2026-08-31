/**
 * Renewal notice batches — plan §8 ("P2 adds" and "Records"), §9, FR-12,
 * canvas n26-n36.
 *
 * An insurer sends one PDF holding several hundred renewal notices. The batch is
 * uploaded, OCR runs against that insurer's own template, and the extracted rows
 * are matched against the policies this agency actually holds. §9's rule about
 * the handful that will not match is the reason this cluster exists as three
 * types rather than one: "An unmatched row cannot be included in a bulk send.
 * Hard block, not a warning."
 *
 * Two invariants beyond the machines:
 *
 *   - OCR never silent-commits. Every extracted value arrives on the row as an
 *     unconfirmed `OcrField`, and `send` refuses while any row in the send still
 *     holds one. The bulk send is a form, and a form with an unconfirmed
 *     extraction cannot submit.
 *   - The premium printed on a notice is a figure read off the insurer's paper.
 *     `noticePremiumSource` records that, the fixture schema refuses `computed`,
 *     and nothing here works a premium out from anything.
 */

import type { Money } from '../../domain/money'
import type { NoticeBatchState, NoticeRowState } from '../../domain/workflows'
import type { PremiumSource } from '../../domain/workflows'
import type { DocumentType, OcrField } from './documents'
import type { ListQuery, Page, ReadRepository } from './query'
import type { MutationResult } from './result'

/* ------------------------------------------------------------ OCR template */

/** One value the template knows how to find on this insurer's layout. */
export type OcrTemplateField = {
  readonly key: string
  readonly label: string
  /** The printed text immediately before the value on the insurer's own page. */
  readonly anchor: string
  readonly required: boolean
}

/**
 * A per-insurer extraction template. Every company lays its renewal notice out
 * differently, so the anchors are configuration an admin edits rather than a
 * parser a developer rewrites — canvas flow 6's claim, applied to OCR.
 */
export type OcrTemplate = {
  readonly id: string
  readonly companyId: string
  readonly key: string
  readonly label: string
  readonly docType: DocumentType
  readonly version: number
  readonly fields: readonly OcrTemplateField[]
  readonly active: boolean
  readonly updatedAt: string
}

/* --------------------------------------------------------------- the batch */

export type NoticeBatch = {
  readonly id: string
  /** `NTB-0001`. Readable in a queue; the sequence counter does not own it. */
  readonly systemNo: string
  readonly companyId: string
  /** The template OCR ran with. Null when the company has none configured yet. */
  readonly ocrTemplateId: string | null
  readonly state: NoticeBatchState
  /** The uploaded PDF, as a document record. Content stays in the documents cluster. */
  readonly sourceDocumentId: string | null
  readonly fileName: string
  /** The expiry month the notices cover, `YYYY-MM`. What a queue filters on. */
  readonly expiryMonth: string
  readonly uploadedBy: string
  readonly uploadedAt: string
  readonly ocrStartedAt: string | null
  readonly ocrCompletedAt: string | null
  /** How many rows extraction produced. A fact about the extraction, not a roll-up. */
  readonly rowCount: number
  readonly sentBy: string | null
  readonly sentAt: string | null
}

/**
 * One extracted row, and what became of it. `notice*` fields are what the paper
 * says; `matched*` fields are what this agency holds. Keeping the two apart is
 * what makes a mismatch visible instead of overwritten.
 */
export type NoticeMatch = {
  readonly id: string
  readonly batchId: string
  readonly rowNumber: number
  readonly state: NoticeRowState
  /** The policy number as printed on the insurer's notice. */
  readonly noticePolicyNo: string
  readonly noticeCustomerName: string
  readonly noticeExpiryDate: string | null
  /** Printed on the notice and typed off it. Never derived from a held policy. */
  readonly noticePremium: Money | null
  readonly noticePremiumSource: PremiumSource | null
  readonly matchedPolicyId: string | null
  readonly matchedCustomerId: string | null
  /** Who linked it by hand, when automatic matching could not. */
  readonly manuallyLinkedBy: string | null
  readonly linkedAt: string | null
  readonly rejectReason: string | null
  /** Every value lifted off the notice. Unconfirmed ones block the bulk send. */
  readonly ocrFields: readonly OcrField[]
}

/** The counts a batch header and the send gate both need. */
export type NoticeBatchSummary = {
  readonly batchId: string
  readonly total: number
  readonly pending: number
  readonly matched: number
  readonly unmatched: number
  readonly rejected: number
  /** Rows still holding a value nobody has confirmed. A send is blocked on these. */
  readonly unconfirmedExtractions: number
}

/* ------------------------------------------------------------- the commands */

export type UploadNoticeBatchCommand = {
  readonly actorId: string
  readonly companyId: string
  readonly fileName: string
  readonly expiryMonth: string
  readonly uploadedBy: string
  readonly ocrTemplateId?: string | null
  readonly sourceDocumentId?: string | null
  readonly now?: Date
}

/** One row as extraction produced it, before anyone has looked at it. */
export type ExtractedNoticeRow = {
  readonly noticePolicyNo: string
  readonly noticeCustomerName: string
  readonly noticeExpiryDate?: string | null
  readonly noticePremium?: Money
  readonly noticePremiumSource?: PremiumSource
  /** The policy the number resolved to, when it resolved to one at all. */
  readonly matchedPolicyId?: string | null
  readonly ocrFields?: readonly OcrField[]
}

/**
 * Extraction finished. The rows are written by this move, and each one is then
 * routed through the row machine — matched where the number resolved, unmatched
 * where it did not — so no row reaches `review` with a state nobody assigned.
 */
export type CompleteOcrCommand = {
  readonly actorId: string
  readonly rows: readonly ExtractedNoticeRow[]
  readonly now?: Date
}

export type NoticeBatchStepCommand = {
  readonly actorId: string
  readonly note?: string
  readonly now?: Date
}

export type SendNoticeBatchCommand = {
  readonly actorId: string
  readonly sentBy: string
  /** The rows a person ticked. Left out, the send covers every row in review. */
  readonly selectedRowIds?: readonly string[]
  readonly now?: Date
}

/** Confirming an extracted value is part of every row move, never a silent step. */
export type NoticeRowCommand = {
  readonly actorId: string
  /** Names of `ocrFields` the person has now checked against the notice. */
  readonly confirmedFields?: readonly string[]
  readonly now?: Date
}

export type MatchNoticeRowCommand = NoticeRowCommand & {
  readonly matchedPolicyId: string
}

/** §9: the manual link is the way out of unmatched, and it records who made it. */
export type LinkNoticeRowCommand = NoticeRowCommand & {
  readonly matchedPolicyId: string
  readonly manuallyLinkedBy: string
}

export type RejectNoticeRowCommand = NoticeRowCommand & {
  readonly rejectReason: string
}

/* --------------------------------------------------------- the repositories */

export type NoticeBatchRepository = ReadRepository<NoticeBatch> & {
  bySystemNo(systemNo: string): Promise<NoticeBatch | null>
  forCompany(companyId: string): Promise<readonly NoticeBatch[]>
  queue(query?: ListQuery): Promise<Page<NoticeBatch>>
  rows(batchId: string, query?: ListQuery): Promise<Page<NoticeMatch>>
  row(rowId: string): Promise<NoticeMatch | null>
  summary(batchId: string): Promise<NoticeBatchSummary | null>

  upload(command: UploadNoticeBatchCommand): Promise<MutationResult<NoticeBatch>>
  startOcr(id: string, command: NoticeBatchStepCommand): Promise<MutationResult<NoticeBatch>>
  completeOcr(id: string, command: CompleteOcrCommand): Promise<MutationResult<NoticeBatch>>
  /** Refused while any row in the send is unmatched or holds an unconfirmed value. */
  send(id: string, command: SendNoticeBatchCommand): Promise<MutationResult<NoticeBatch>>

  matchRow(rowId: string, command: MatchNoticeRowCommand): Promise<MutationResult<NoticeMatch>>
  markRowUnmatched(rowId: string, command: NoticeRowCommand): Promise<MutationResult<NoticeMatch>>
  linkRow(rowId: string, command: LinkNoticeRowCommand): Promise<MutationResult<NoticeMatch>>
  rejectRow(rowId: string, command: RejectNoticeRowCommand): Promise<MutationResult<NoticeMatch>>
}

export type OcrTemplateRepository = ReadRepository<OcrTemplate> & {
  forCompany(companyId: string): Promise<readonly OcrTemplate[]>
  /** The active template a company uses for one kind of document. */
  forDocType(companyId: string, docType: DocumentType): Promise<OcrTemplate | null>
}
