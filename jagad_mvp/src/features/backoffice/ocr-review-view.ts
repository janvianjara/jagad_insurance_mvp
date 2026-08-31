/**
 * Reading an OCR review row — its words, its masking, and what is still waiting
 * on a person.
 *
 * Pure: no DOM, no repository, no React. Two of the functions below are
 * constitution lines wearing presentation clothes, and both are here rather than
 * in a component because a rule that can only be tested through a rendered tree
 * is a rule nobody will test.
 *
 *   **Aadhaar is masked before an extraction becomes a field, not after.**
 *   `<OcrField>` writes its extraction into a `data-extracted` attribute, so the
 *   moment a value is handed to that component is the last moment masking can
 *   happen at all. `maskExtractedValue` is that moment, and it is wider than the
 *   KYC feature's own rule on purpose: an Aadhaar document masks whatever its
 *   field is called, because a field named `idNumber` on an Aadhaar scan is
 *   still an Aadhaar number.
 *
 *   **Nothing here reads document content.** `extractedText` exists on
 *   `DocumentRecord`, is classified `document-content` (§14.1), and is not
 *   referenced anywhere in this module or in any screen that imports it. The
 *   extracted FIELDS are what a reviewer confirms; the body text of the document
 *   is not shown, not summarised and not carried anywhere near Assistant code.
 *
 * And the rule that shapes the confidence table: there is no threshold. Nothing
 * in this module branches on a confidence, waves a reading through above one, or
 * hides a field below one. A rule that auto-accepted a high-confidence read is
 * exactly the silent commit FR-16 forbids, wearing a convenience for a disguise.
 */

import { containsFullAadhaar, maskAadhaarToLast4 } from '../../domain/workflows'
import type { DocumentRecord, DocumentType } from '../../data/repo'
import type { OcrExtraction } from '../../components/guardrails'
import type { Severity } from '../../ui/tone'
// The two extraction vocabularies this product already has, imported rather than
// restated. A third copy of "what an insurer policy number is called" is how the
// same field ends up with two labels on two screens.
import { MOCK_CONFIDENCE } from '../policies/ocr-extract'
import { NOTICE_CONFIDENCE, NOTICE_FIELD_LABEL } from '../notices/notice-view'
import { maskAtExtraction } from '../kyc/kyc-view'

/* ------------------------------------------------------------------- masking */

/** Document types whose every extracted value is treated as an identity number. */
export const IDENTITY_DOC_TYPES: readonly DocumentType[] = ['aadhaar']

/**
 * The only representation of an extracted value this screen is allowed to hand
 * onward.
 *
 * Constitution: "Aadhaar: last-4 maximum in staff UI, never the full number
 * anywhere." The function takes the raw read and returns the masked one; the
 * original never leaves it, so there is nothing downstream that could put twelve
 * digits into an input, a data attribute or an export.
 *
 * `maskAtExtraction` — the KYC feature's own rule, and the domain's masking
 * function underneath it — does the work for every field named after an Aadhaar.
 * The extra clause here covers the case that rule cannot see: a full number
 * arriving on an Aadhaar document under any field name at all.
 */
export function maskExtractedValue(
  docType: DocumentType,
  name: string,
  value: string,
): string {
  if (IDENTITY_DOC_TYPES.includes(docType) && containsFullAadhaar(value)) {
    return maskAadhaarToLast4(value)
  }
  return maskAtExtraction(name, value)
}

/** Whether this reading is one the staff interface may only ever see the tail of. */
export function isMaskedField(docType: DocumentType, name: string): boolean {
  return IDENTITY_DOC_TYPES.includes(docType) || name.toLowerCase().includes('aadhaar')
}

/* --------------------------------------------------------------- the wording */

/**
 * What an extracted field is called, in words a reviewer recognises.
 *
 * Built from the vocabularies the product already has — the issuance fields the
 * policy extractor reads, and the renewal-notice fields — plus the identity
 * fields the KYC documents carry. An unknown name falls through to itself rather
 * than to a placeholder: a field this table has not met is still a field a person
 * has to confirm, and hiding its name behind "Field 3" would make that harder.
 */
const FIELD_LABEL: Readonly<Record<string, string>> = {
  ...NOTICE_FIELD_LABEL,
  insurerNo: 'Insurer policy number',
  finalPremium: 'Final premium, as printed',
  startDate: 'Policy start date',
  expiryDate: 'Policy expiry date',
  aadhaarLast4: 'Aadhaar (last 4)',
  panNumber: 'PAN',
  dateOfBirth: 'Date of birth',
  addressLine: 'Address',
  pincode: 'PIN code',
  fullName: 'Name as printed',
}

export function fieldLabel(name: string): string {
  return FIELD_LABEL[name] ?? name
}

/* ------------------------------------------------------------- the confidence */

/**
 * What the extractor said it was sure of, per field.
 *
 * Shown by `<OcrField>` and acted on by nothing. Where neither existing table
 * knows a field, the mock reports the same flat figure the KYC extractor does —
 * and this is a mock reporting a mock's number, which the screen says out loud
 * rather than dressing up as a measurement.
 */
export const DEFAULT_CONFIDENCE = 0.9

export function confidenceFor(name: string): number {
  return MOCK_CONFIDENCE[name as keyof typeof MOCK_CONFIDENCE] ?? NOTICE_CONFIDENCE[name] ?? DEFAULT_CONFIDENCE
}

/* --------------------------------------------------------------- extractions */

/**
 * One extracted value as this screen holds it: masked, labelled, and carrying
 * whatever verdict a person has already given it.
 */
export type ReviewExtraction = {
  readonly name: string
  readonly label: string
  /** Masked where masking applies. This is what reaches `<OcrField>` and the DOM. */
  readonly extraction: OcrExtraction
  /** True once a person has confirmed it — in this session or a previous one. */
  readonly confirmed: boolean
  /** What the record would carry: the read, or what a person typed over it. */
  readonly value: string
  /** Whether the staff interface may only see the tail of this one. */
  readonly masked: boolean
}

/** A person's verdict on one extracted value (FR-16). */
export type ExtractionVerdict = {
  readonly documentId: string
  readonly name: string
  /** What the record will carry — the read, or what a person typed over it. */
  readonly value: string
  /** What the extractor read, masked. Kept whatever happens to `value`. */
  readonly extracted: string
  readonly confirmed: boolean
  readonly reviewedAt: string
  readonly actorId: string
}

/**
 * The document's extractions, as a reviewer sees them.
 *
 * The fixture's own `confirmed` is a previous session's verdict; a verdict
 * recorded in this one replaces it. Nothing in this function sets `confirmed` on
 * its own — that is the whole of FR-16, and it is kept by the absence of any
 * branch that could.
 */
export function extractionsOf(
  document: DocumentRecord,
  verdicts: readonly ExtractionVerdict[],
): readonly ReviewExtraction[] {
  const recorded = new Map(verdicts.map((verdict) => [verdict.name, verdict]))

  return document.ocrFields.map((field): ReviewExtraction => {
    const masked = maskExtractedValue(document.docType, field.name, field.value)
    const verdict = recorded.get(field.name)

    return {
      name: field.name,
      label: fieldLabel(field.name),
      extraction: { value: masked, confidence: confidenceFor(field.name) },
      confirmed: verdict?.confirmed ?? field.confirmed,
      value: verdict?.value ?? masked,
      masked: isMaskedField(document.docType, field.name),
    }
  })
}

/** The extractions still waiting on a person. The form around them cannot submit. */
export function unconfirmed(
  extractions: readonly ReviewExtraction[],
): readonly ReviewExtraction[] {
  return extractions.filter((extraction) => !extraction.confirmed)
}

/** The lowest confidence the extractor reported on this document. Null when none. */
export function lowestConfidence(extractions: readonly ReviewExtraction[]): number | null {
  if (extractions.length === 0) return null
  return extractions.reduce(
    (lowest, extraction) => Math.min(lowest, extraction.extraction.confidence),
    1,
  )
}

/* ------------------------------------------------------------ the row's state */

/**
 * Where one row stands.
 *
 * `none` is a real and common answer, not an error: three of the documents on
 * this queue have no extraction at all, because nothing was run over them. A row
 * that pretended otherwise would be the first place this product told somebody
 * something untrue.
 */
export const REVIEW_PROGRESS = {
  waiting: 'waiting',
  reviewed: 'reviewed',
  none: 'none',
} as const

export type ReviewProgress = (typeof REVIEW_PROGRESS)[keyof typeof REVIEW_PROGRESS]

export const REVIEW_PROGRESS_LABEL: Readonly<Record<ReviewProgress, string>> = {
  waiting: 'Extractions awaiting a person',
  reviewed: 'Every extraction confirmed',
  none: 'Nothing was extracted',
}

export function reviewProgressOf(extractions: readonly ReviewExtraction[]): ReviewProgress {
  if (extractions.length === 0) return REVIEW_PROGRESS.none
  return unconfirmed(extractions).length === 0
    ? REVIEW_PROGRESS.reviewed
    : REVIEW_PROGRESS.waiting
}

/* ------------------------------------------------------------------ severity */

const DAY_MS = 86_400_000

/** Whole days since the document was submitted. Null when nobody recorded that. */
export function daysWaiting(document: DocumentRecord, now: Date): number | null {
  if (document.submittedAt === null) return null
  const submitted = new Date(document.submittedAt).getTime()
  if (Number.isNaN(submitted)) return null
  return Math.floor((now.getTime() - submitted) / DAY_MS)
}

/**
 * How long an extraction may sit unread before the row is shouting.
 *
 * Three days: an extracted value is a machine's guess sitting in front of a
 * record it has not entered, and the longer it waits the more likely somebody
 * downstream starts treating it as fact. Configuration in P1 (FR-22).
 */
export const REVIEW_AGE_LIMIT_DAYS = 3

/**
 * How much trouble a row is in.
 *
 * Lime — "needs a person" — is the queue's ordinary colour, because that is
 * literally what every row here is. Age is what pushes it to amber. A document
 * with nothing extracted is `cool`: it is on this queue because it has not been
 * reviewed, but there is no machine reading waiting to be vouched for, so it is
 * a lighter kind of work.
 */
export function ocrReviewSeverity(
  document: DocumentRecord,
  extractions: readonly ReviewExtraction[],
  now: Date,
): Severity {
  const progress = reviewProgressOf(extractions)
  if (progress === REVIEW_PROGRESS.reviewed) return 'good'

  const waited = daysWaiting(document, now)
  const overdue = waited !== null && waited >= REVIEW_AGE_LIMIT_DAYS

  if (progress === REVIEW_PROGRESS.none) return overdue ? 'warm' : 'cool'
  return overdue ? 'warm' : 'attn'
}
