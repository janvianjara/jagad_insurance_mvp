/**
 * The vault, read. Pure — no DOM, no repository, no React.
 *
 * The document registry (§14.1) already decides what may be shown to whom, and
 * this module's job is to make that decision legible rather than to restate it.
 * Three groups of fields, and the split is the whole design of the screen:
 *
 *   `operational`       — type, version, review state, retention class,
 *                         presence. This is the vault list. Every column below
 *                         comes from here.
 *   `contact`           — who uploaded it.
 *   `document-content`  — file name, URL, MIME type, extracted text, OCR
 *                         fields. NONE of this belongs in a list, and it is
 *                         shown in the drawer only to a template that holds the
 *                         `document-content` grant.
 *
 * So the list is metadata and nothing else, by construction rather than by
 * anybody remembering. An identity number never appears here at all — a
 * document's Aadhaar reading is masked at extraction before it reaches storage
 * (§9), and what the drawer shows is the SUBJECT's last four through
 * `<MaskedValue>`, which is the only representation the product allows.
 */

import type { DocumentRecord, DocumentReviewState, DocumentType } from '../../data/repo'
import type { Severity, Tone } from '../../ui/tone'

export const DOC_TYPE_LABEL: Readonly<Record<DocumentType, string>> = {
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  photo: 'Photograph',
  proposal_form: 'Proposal form',
  policy_pdf: 'Policy document',
  quotation_pdf: 'Quotation',
  renewal_notice: 'Renewal notice',
  cheque_image: 'Cheque',
  discharge_summary: 'Discharge summary',
  claim_form: 'Claim form',
  endorsement_letter: 'Endorsement letter',
}

export const REVIEW_LABEL: Readonly<Record<DocumentReviewState, string>> = {
  awaiting: 'Awaiting',
  submitted: 'Submitted',
  verified: 'Verified',
  rejected: 'Rejected',
}

export const REVIEW_TONE: Readonly<Record<DocumentReviewState, Tone>> = {
  awaiting: 'attn',
  submitted: 'warn',
  verified: 'ok',
  rejected: 'bad',
}

/**
 * The document types that evidence an identity number.
 *
 * Used only to decide whether the drawer shows the subject's masked identifier
 * at all. It never unlocks anything: the identifier is masked either way, and
 * there is no code path in this feature that renders a full one.
 */
export const IDENTITY_DOC_TYPES: readonly DocumentType[] = ['aadhaar', 'pan']

export function isIdentityDocument(document: DocumentRecord): boolean {
  return IDENTITY_DOC_TYPES.includes(document.docType)
}

/**
 * How much trouble a row is in.
 *
 * A rejected document is the hot one: somebody was asked for a paper, sent the
 * wrong thing, and does not know yet. Awaiting is `attn` — lime, needs a
 * person — because a checklist line with nothing against it is work rather than
 * an error.
 */
export function documentSeverity(document: DocumentRecord): Severity {
  if (document.reviewState === 'rejected') return 'hot'
  if (!document.isPresent) return 'attn'
  if (document.reviewState === 'awaiting') return 'attn'
  if (document.reviewState === 'submitted') return 'warm'
  return 'good'
}

/** The subject entities the vault can name. Anything else renders as its type. */
export const DOCUMENT_SUBJECT_ENTITIES: readonly string[] = [
  'Customer',
  'Policy',
  'Quotation',
  'Claim',
]
