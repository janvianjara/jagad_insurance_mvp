/**
 * The KYC file, derived. Pure — no DOM, no repository, no React.
 *
 * Three things happen here and each of them is a rule from §9 rather than a
 * presentation choice:
 *
 *   1. **The checklist is configuration.** Its wording comes from the company's
 *      or product's `DocChecklist`; this module only decides whether each line is
 *      on file, by matching it to a document type and asking the vault for
 *      presence. Presence, never content (§14.1).
 *
 *   2. **Aadhaar is masked at extraction.** Not at display — at extraction, so
 *      the full number never reaches storage and never reaches a screen. The
 *      fixtures already store the masked read, and `extractionsFor` masks again
 *      on the way past: an extractor that one day returns twelve digits produces
 *      four here, because the only thing downstream of this function is a
 *      `<OcrField>` that writes its value into the DOM.
 *
 *   3. **The completeness gate is the machine's guards, not a second copy.**
 *      `kycCommandFor` assembles exactly what `kycMachine`'s guards read, so the
 *      sentence the screen shows when the button is blocked is the sentence the
 *      transition would have refused with. There is no rule in this file that
 *      the machine does not also hold.
 */

import { containsFullAadhaar, maskAadhaarToLast4 } from '../../domain/workflows'
import type { ExtractedField, KycCompletionRoute } from '../../domain/workflows'
import type { DocChecklist, DocumentRecord, DocumentType, KycCommand } from '../../data/repo'
import { CHECKLIST_STATES } from '../../components/ChecklistPanel'
import type { ChecklistItem } from '../../components/ChecklistPanel'
import type { OcrExtraction } from '../../components/guardrails'
import type { ChecklistReceipt, CustomerDossier, ExtractionReview } from '../customers/data/customer-desk'

/**
 * Which document type a checklist line is asking for.
 *
 * Matched on the line's own words rather than on a key, because the checklist an
 * admin edits is prose and always will be. A line that matches nothing is not
 * dropped — it stays on the list as outstanding until somebody records it
 * arriving, which is the honest answer for "Address proof" in a vault whose
 * document types do not yet include one.
 */
const TYPE_KEYWORDS: readonly (readonly [DocumentType, RegExp])[] = [
  ['aadhaar', /aadhaar/i],
  ['pan', /\bpan\b/i],
  ['photo', /photograph|\bphoto\b/i],
  ['proposal_form', /proposal/i],
  ['policy_pdf', /policy (document|copy|pdf)/i],
  ['cheque_image', /cheque/i],
]

export function docTypeForItem(item: string): DocumentType | null {
  return TYPE_KEYWORDS.find(([, pattern]) => pattern.test(item))?.[0] ?? null
}

/* ----------------------------------------------------------------- checklist */

export type KycChecklist = {
  readonly items: readonly ChecklistItem[]
  /** Where the list came from, for the panel's caption. */
  readonly source: string
}

function documentFor(
  documents: readonly DocumentRecord[],
  docType: DocumentType | null,
): DocumentRecord | undefined {
  if (docType === null) return undefined
  return documents.find((document) => document.docType === docType && document.isPresent)
}

function receiptFor(
  receipts: readonly ChecklistReceipt[],
  item: string,
): ChecklistReceipt | undefined {
  return receipts.find((receipt) => receipt.item === item)
}

/**
 * The checklist, resolved against what is actually on file.
 *
 * A document in the vault decides the line; a back-office receipt decides it
 * when the vault has no type for what was asked for. Both are presence, and
 * neither carries a word of what the document says.
 */
export function checklistFor(
  dossier: CustomerDossier,
  checklist: DocChecklist | null,
  sourceLabel: string,
): KycChecklist {
  if (!checklist) return { items: [], source: sourceLabel }

  const items = checklist.items.map((label): ChecklistItem => {
    const docType = docTypeForItem(label)
    const document = documentFor(dossier.documents, docType)
    const receipt = receiptFor(dossier.receipts, label)

    if (document) {
      const verified = document.reviewState === 'verified'
      const rejected = document.reviewState === 'rejected'
      return {
        key: label,
        label,
        state: rejected
          ? CHECKLIST_STATES.rejected
          : verified
            ? CHECKLIST_STATES.verified
            : CHECKLIST_STATES.received,
        note: verified
          ? 'Verified by the back office.'
          : rejected
            ? 'Rejected on review. Ask the customer for a fresh copy.'
            : 'Received, not yet verified.',
      }
    }

    if (receipt) {
      return {
        key: label,
        label,
        state: CHECKLIST_STATES.received,
        note: receipt.viaConsentLink
          ? 'Supplied by the customer through the consent link.'
          : 'Recorded as received at the desk.',
      }
    }

    return {
      key: label,
      label,
      state: CHECKLIST_STATES.outstanding,
      note: 'Not on file. KYC cannot complete until it is.',
    }
  })

  return { items, source: sourceLabel }
}

/* ---------------------------------------------------------------- extraction */

export type KycExtraction = {
  readonly name: string
  readonly label: string
  /** What the extractor read, already masked where masking applies. */
  readonly extraction: OcrExtraction
  /** The document it came off, for the review panel's caption. */
  readonly documentLabel: string
  /** True once a person has confirmed it in this session or a previous one. */
  readonly confirmed: boolean
  readonly value: string
}

const FIELD_LABEL: Readonly<Record<string, string>> = {
  aadhaarLast4: 'Aadhaar (last 4)',
  panNumber: 'PAN',
  dateOfBirth: 'Date of birth',
  addressLine: 'Address',
  pincode: 'PIN code',
  fullName: 'Name as printed',
}

/**
 * Confidence the mock extractor reports.
 *
 * Shown, never acted on — `<OcrField>` prints it and nothing branches on it,
 * because a threshold that auto-accepts a high-confidence read is exactly the
 * silent commit FR-16 forbids.
 */
const MOCK_CONFIDENCE = 0.92

/**
 * §9's first bullet, enforced on the way to the screen.
 *
 * `maskAadhaarToLast4` is the domain's own function, so the rule has one
 * implementation. Anything that still holds a full run of digits is reduced to
 * four before it can become an `<OcrField>` value — and `<OcrField>` writes its
 * extraction into a `data-extracted` attribute, so "before it becomes one" is
 * the last moment this can be done at all.
 */
export function maskAtExtraction(name: string, value: string): string {
  if (!containsFullAadhaar(value)) return value
  return name.toLowerCase().includes('aadhaar') ? maskAadhaarToLast4(value) : value
}

/**
 * The last four digits of whatever an upstream layer handed over.
 *
 * Same posture as `<MaskedField>`, and for the same reason: a caller reaching
 * this function with more than four digits has already made a mistake somewhere,
 * and the two candidate responses are "pass the full number on" or "pass four
 * digits on". There is no third. Anything that puts an Aadhaar into a form
 * value, a command or a prefill goes through here, so there is exactly one place
 * where that decision is taken.
 */
export function aadhaarLast4Of(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.length === 0 ? null : digits.slice(-LAST4)
}

const LAST4 = 4

export function extractionsFor(dossier: CustomerDossier): readonly KycExtraction[] {
  const reviews = new Map(dossier.reviews.map((review) => [review.name, review]))

  return dossier.documents.flatMap((document) =>
    document.ocrFields.map((field): KycExtraction => {
      const extracted = maskAtExtraction(field.name, field.value)
      const review: ExtractionReview | undefined = reviews.get(field.name)

      return {
        name: field.name,
        label: FIELD_LABEL[field.name] ?? field.name,
        extraction: { value: extracted, confidence: MOCK_CONFIDENCE },
        documentLabel: document.systemNo,
        // The fixture's own `confirmed` is a prior session's verdict; a review in
        // this one replaces it. Nothing here sets `confirmed` on its own.
        confirmed: review?.confirmed ?? field.confirmed,
        value: review?.value ?? extracted,
      }
    }),
  )
}

/** The extractions still waiting on a person. The form around them cannot submit. */
export function unconfirmedExtractions(
  extractions: readonly KycExtraction[],
): readonly KycExtraction[] {
  return extractions.filter((extraction) => !extraction.confirmed)
}

/* ------------------------------------------------------------- the gate */

export type KycCommandInput = {
  readonly dossier: CustomerDossier
  readonly checklist: KycChecklist
  readonly extractions: readonly KycExtraction[]
  readonly actorId: string
  readonly route: KycCompletionRoute
  readonly now: Date
}

/**
 * Exactly what `kycMachine`'s guards read, and nothing more.
 *
 * `aadhaarLast4` is taken from the confirmed extraction when there is one and
 * from the record otherwise; either way it is four digits, and the guard refuses
 * anything that is not. There is no branch here that could produce a longer
 * value, and none that could set `aadhaarFull` — the field exists on the context
 * only so the guard has something to refuse.
 */
export function kycCommandFor(input: KycCommandInput): KycCommand {
  const { dossier, checklist, extractions, actorId, route, now } = input

  const extractedFields: readonly ExtractedField[] = extractions.map((extraction) => ({
    name: extraction.name,
    value: extraction.value,
    confirmed: extraction.confirmed,
  }))

  const aadhaar = extractions.find((extraction) => extraction.name === 'aadhaarLast4')
  const last4 = aadhaarLast4Of(aadhaar?.value ?? dossier.customer.aadhaarLast4) ?? ''

  return {
    actorId,
    route,
    requiredDocuments: checklist.items.map((item) => item.label),
    presentDocuments: checklist.items
      .filter((item) => item.state !== CHECKLIST_STATES.outstanding && item.state !== CHECKLIST_STATES.rejected)
      .map((item) => item.label),
    extractedFields,
    ...(last4.length === LAST4 ? { aadhaarLast4: last4 } : {}),
    now,
  }
}

/**
 * Which checklist lines the customer's own submission answers.
 *
 * The consent link renders the configured KYC schema (`resolveFormSchema` with
 * `objectKey: 'kyc'`), so what it can supply is decided by that schema's fields
 * rather than by anything invented here: an identity proof, an address proof and
 * a PAN. A line the schema does not ask for — a passport photograph, on the seed
 * checklist — stays outstanding, and the back office collects it. That is
 * canvas 3.1's "staff + consent link" in one sentence.
 */
export function itemsSuppliedByConsent(
  checklist: KycChecklist,
  values: Readonly<Record<string, unknown>>,
): readonly string[] {
  const supplied = (key: string) => {
    const value = values[key]
    if (Array.isArray(value)) return value.length > 0
    return typeof value === 'string' ? value.trim() !== '' : value !== undefined && value !== null
  }

  const answers: readonly (readonly [string, (item: string) => boolean])[] = [
    ['identityProofFile', (item) => docTypeForItem(item) === 'aadhaar'],
    ['addressProofFile', (item) => /address proof/i.test(item)],
    ['panNumber', (item) => docTypeForItem(item) === 'pan'],
  ]

  return checklist.items
    .filter((item) =>
      answers.some(([key, matches]) => supplied(key) && matches(item.label)),
    )
    .map((item) => item.label)
}
