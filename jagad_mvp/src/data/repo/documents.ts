/**
 * Records — document metadata. Plan §8, §14.1.
 *
 * Metadata only, and the registry says so in its classification: `isPresent`,
 * `reviewState` and `docType` are `operational`, while `fileName`, `fileUrl`,
 * `mimeType`, `extractedText` and `ocrFields` are `document-content` — the class
 * the Assistant never receives in any form. The split is the point: the Assistant
 * may know a KYC document exists and is verified (FR-22.14) and may never learn a
 * word of what it says.
 *
 * `ocrFields` carries the OCR invariant. A field arrives unconfirmed, renders
 * through `<OcrField>`, and a form holding any unconfirmed extraction cannot
 * submit. Nothing in this layer flips `confirmed` on a caller's behalf.
 */

import type { ListQuery, Page, ReadRepository } from './query'

export const DOCUMENT_TYPES = {
  aadhaar: 'aadhaar',
  pan: 'pan',
  photo: 'photo',
  proposalForm: 'proposal_form',
  policyPdf: 'policy_pdf',
  quotationPdf: 'quotation_pdf',
  renewalNotice: 'renewal_notice',
  chequeImage: 'cheque_image',
  dischargeSummary: 'discharge_summary',
  claimForm: 'claim_form',
  endorsementLetter: 'endorsement_letter',
} as const

export type DocumentType = (typeof DOCUMENT_TYPES)[keyof typeof DOCUMENT_TYPES]

export const DOCUMENT_REVIEW_STATES = {
  awaiting: 'awaiting',
  submitted: 'submitted',
  verified: 'verified',
  rejected: 'rejected',
} as const

export type DocumentReviewState =
  (typeof DOCUMENT_REVIEW_STATES)[keyof typeof DOCUMENT_REVIEW_STATES]

/** One value lifted off a document, before a person has confirmed it. */
export type OcrField = {
  readonly name: string
  readonly value: string
  readonly confirmed: boolean
}

export type DocumentRecord = {
  readonly id: string
  readonly systemNo: string
  readonly subjectEntity: string
  readonly subjectId: string
  readonly docType: DocumentType
  readonly version: number
  readonly submittedAt: string | null
  readonly verifiedAt: string | null
  readonly verifiedBy: string | null
  readonly reviewState: DocumentReviewState
  readonly retentionClass: string
  /** Presence, never content. This is the one thing the Assistant may know. */
  readonly isPresent: boolean
  readonly uploadedByName: string | null
  readonly fileName: string | null
  readonly fileUrl: string | null
  readonly mimeType: string | null
  readonly extractedText: string | null
  readonly ocrFields: readonly OcrField[]
}

export type DocumentRepository = ReadRepository<DocumentRecord> & {
  forSubject(subjectEntity: string, subjectId: string): Promise<readonly DocumentRecord[]>
  /** Documents still to be looked at. The back-office review queue. */
  awaitingReview(query?: ListQuery): Promise<Page<DocumentRecord>>
  /** Which checklist items are actually present for a subject. Presence only. */
  presence(
    subjectEntity: string,
    subjectId: string,
  ): Promise<Readonly<Record<string, boolean>>>
}
