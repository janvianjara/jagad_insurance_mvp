/**
 * What the Assistant produces — FR-22.9, and the prototype's `DOCS` as data.
 *
 * "Generates the configured document types from data already in the system, on
 * agency letterhead." A produced document is therefore not a screen and not a
 * summary: it is the sheet the customer, the insurer or the accountant receives,
 * and the prototype renders it as one — masthead, reference block, sections,
 * signature — inside the drawer, at the size it will print.
 *
 * Two things are load-bearing here.
 *
 *   Every value is a `Cell`, so a produced document formats its money, its dates
 *   and its record numbers through the same render edge every other surface uses
 *   (`<Money>`, `<DateTime>`, `<RecordId>`). A document cannot carry a formatted
 *   amount any more than a block can, which is what stops "generate the
 *   statement" from becoming the one path where a figure gets invented (D3).
 *
 *   The `amounts` section has no total row and no way to express one. The
 *   prototype's own commission statement prints a total; ours prints the rows
 *   that were recorded and stops, because a sum across recorded figures is
 *   arithmetic the Assistant is not allowed to do. Where a total is genuinely
 *   part of the document, it arrives as a recorded figure like any other row.
 *
 * Nothing in this module is React and nothing in it is markup, so a document can
 * be built in a pure function and asserted on by reading its values.
 */

import type { Cell, TableColumn, TableRow } from '../blocks/blocks'

export const DOCUMENT_SECTIONS = {
  heading: 'heading',
  para: 'para',
  meta: 'meta',
  table: 'table',
  amounts: 'amounts',
  signature: 'signature',
} as const

export type DocumentSectionKind = (typeof DOCUMENT_SECTIONS)[keyof typeof DOCUMENT_SECTIONS]

export type DocumentMetaItem = {
  readonly key: string
  readonly label: string
  readonly value: Cell
}

export type DocumentAmountRow = {
  readonly key: string
  readonly label: string
  /** Paise, as recorded. Null prints as "not recorded", never as zero. */
  readonly paise: number | null
}

export type DocumentSection =
  | { readonly section: 'heading'; readonly text: string }
  | { readonly section: 'para'; readonly text: string }
  | { readonly section: 'meta'; readonly items: readonly DocumentMetaItem[] }
  | {
      readonly section: 'table'
      readonly columns: readonly TableColumn[]
      readonly rows: readonly TableRow[]
    }
  | {
      readonly section: 'amounts'
      readonly label: string
      /** Where the figures came from. On every amounts block, without exception. */
      readonly note: string
      readonly rows: readonly DocumentAmountRow[]
    }
  | { readonly section: 'signature'; readonly by: string; readonly role: string }

/**
 * One produced document.
 *
 * `pages` is what the sheet says at its foot. The drawer renders the first page
 * and says so, because a one-page preview claiming to be the whole eleven-page
 * pack is the kind of small lie that costs a person their trust in the rest.
 */
export type AssistantDocumentPage = {
  readonly id: string
  /** What kind of document this is: "Renewal Notice", "Claim Summary". */
  readonly title: string
  /** What it would be called on disk, and what the feed card names. */
  readonly fileName: string
  readonly pages: number
  /** The agency's own reference for it. */
  readonly reference: string
  /** When it was generated, as an ISO string. */
  readonly issuedOn: string
  readonly addressedTo: string
  readonly agencyName: string
  readonly agencyLine: string
  readonly sections: readonly DocumentSection[]
}

/**
 * The agency masthead, in one place.
 *
 * Single-tenant, so it is a constant rather than configuration — and having it
 * here rather than typed into each producer is what stops six documents drifting
 * into six slightly different letterheads.
 */
export const AGENCY = {
  name: 'Jagad Insurance',
  line: 'Surat, Gujarat · Insurance agency · IRDAI registered',
} as const

export type DocumentDraft = {
  readonly id: string
  readonly title: string
  readonly fileName: string
  readonly pages: number
  readonly reference: string
  readonly issuedOn: string
  readonly addressedTo: string
  readonly sections: readonly DocumentSection[]
}

/** Puts the agency's masthead on a draft. Copies; it computes nothing. */
export function onLetterhead(draft: DocumentDraft): AssistantDocumentPage {
  return {
    id: draft.id,
    title: draft.title,
    fileName: draft.fileName,
    pages: draft.pages,
    reference: draft.reference,
    issuedOn: draft.issuedOn,
    addressedTo: draft.addressedTo,
    agencyName: AGENCY.name,
    agencyLine: AGENCY.line,
    sections: draft.sections,
  }
}
