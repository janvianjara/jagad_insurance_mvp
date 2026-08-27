/**
 * The quotation document, as data. Plan §2 (Source Serif 4 is for generated
 * documents only), §5 Composer row, canvas 2.3.
 *
 * A generated quotation is not a screen. It is a letterhead the customer
 * receives, and the model here is what a PDF renderer would be handed: a header
 * the client's reference layout asks for (persons, dates of birth, floater), the
 * benefit rows, one block per company, and each block's Final Payable Premium.
 *
 * The premium arrives already typed. `buildQuotationDocument` copies figures; it
 * has no arithmetic in it, and a column whose figure is absent stays absent all
 * the way onto the page rather than printing a zero.
 */

import type { Money } from '../../domain/money'
import type { PremiumMode } from '../../domain/workflows'

/** How the generated comparison is laid out. Canvas 2.3: "single or side-by-side". */
export const DOCUMENT_LAYOUTS = {
  single: 'single',
  sideBySide: 'side_by_side',
} as const

export type DocumentLayout = (typeof DOCUMENT_LAYOUTS)[keyof typeof DOCUMENT_LAYOUTS]

/**
 * A person the quotation covers. Name, date of birth and relationship only —
 * the client's reference header asks for exactly these, and a generated document
 * carries no identifier beyond them (never an Aadhaar number, masked or not).
 */
export type DocumentPerson = {
  readonly name: string
  readonly dateOfBirth: string | null
  readonly relationship: string | null
}

export type DocumentBenefitRow = {
  readonly key: string
  readonly label: string
  readonly adHoc: boolean
}

export type DocumentColumn = {
  readonly columnKey: string
  readonly label: string
  readonly companyName: string
  readonly productName: string
  /** Row key to the value printed under this company. */
  readonly benefitValues: Readonly<Record<string, string>>
  /** Null prints as "not quoted", never as a figure. */
  readonly finalPayablePremium: Money | null
}

/**
 * One version of one quotation, ready to render. Prior versions are handed
 * around as this same shape — a v1 document object built from v1's locked lines
 * renders exactly as it was sent (§9).
 */
export type QuotationDocument = {
  readonly kind: 'quotation'
  readonly systemNo: string
  readonly version: number
  readonly issuedOn: string
  readonly customerName: string
  readonly floater: boolean
  readonly persons: readonly DocumentPerson[]
  readonly rows: readonly DocumentBenefitRow[]
  readonly columns: readonly DocumentColumn[]
  /** D-A: printed as information. It does not scale any figure on the page. */
  readonly premiumMode: PremiumMode
  readonly preparedBy: string
  readonly agencyName: string
}

export type BuildQuotationDocumentInput = {
  readonly systemNo: string
  readonly version: number
  readonly issuedOn: string
  readonly customerName: string
  readonly persons: readonly DocumentPerson[]
  readonly rows: readonly DocumentBenefitRow[]
  readonly columns: readonly DocumentColumn[]
  readonly premiumMode: PremiumMode
  readonly preparedBy: string
  readonly agencyName: string
}

/**
 * A floater is a cover over more than one person. It is a fact about the
 * household the header states, not a benefit the platform decides — which is why
 * it is read off the person list and nothing else.
 */
export function isFloater(persons: readonly DocumentPerson[]): boolean {
  return persons.length > 1
}

/** Copies the parts into a document. No figure is created, changed or summed. */
export function buildQuotationDocument(
  input: BuildQuotationDocumentInput,
): QuotationDocument {
  return {
    kind: 'quotation',
    systemNo: input.systemNo,
    version: input.version,
    issuedOn: input.issuedOn,
    customerName: input.customerName,
    floater: isFloater(input.persons),
    persons: input.persons,
    rows: input.rows,
    columns: input.columns,
    premiumMode: input.premiumMode,
    preparedBy: input.preparedBy,
    agencyName: input.agencyName,
  }
}

/**
 * One column prints on its own sheet; two or more print side by side. The caller
 * may override, but this is what the composer asks for by default.
 */
export function defaultLayoutFor(document: QuotationDocument): DocumentLayout {
  return document.columns.length > 1 ? DOCUMENT_LAYOUTS.sideBySide : DOCUMENT_LAYOUTS.single
}

/** How D-A's mode reads on a letterhead. */
export const PREMIUM_MODE_LABELS: Readonly<Record<PremiumMode, string>> = {
  single: 'Single premium',
  annual: 'Annual',
  half_yearly: 'Half-yearly',
  quarterly: 'Quarterly',
  monthly: 'Monthly',
}
