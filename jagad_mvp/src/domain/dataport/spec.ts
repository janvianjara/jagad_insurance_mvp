/**
 * The import contract — what a file has to contain to become records.
 *
 * A spec is data, not code: a list of fields, each with a key, a human label, a
 * kind, and the words a real agency's spreadsheet is likely to use for it. Every
 * other module reads the spec rather than knowing about customers or policies,
 * which is why adding an importable entity is one file and no change here.
 *
 * The **template sheet** is the part that decides whether this feature is
 * usable. Almost nobody maps columns by hand from a book they already keep; they
 * download the template, paste their data into it and upload it back. So the
 * template carries the exact headings the auto-mapper matches on, and worked
 * example rows in the shapes the parsers accept — a date written the way dates
 * are read here, an amount with its paise, an enumeration spelled as one of its
 * options. The examples are documentation that cannot drift from the code,
 * because a test round-trips them through validation.
 *
 * This file holds the shape only. The concrete specs live beside the screens, in
 * `src/features/dataport/specs/`, because each one is bound to the repository
 * constants of the entity it imports and `src/domain` may not depend on
 * `src/data`.
 */

import { makeSheet } from './sheet'
import type { Sheet } from './sheet'

export const FIELD_KINDS = {
  text: 'text',
  number: 'number',
  /** Integer paise on the way in. Recorded exactly as typed; never derived. */
  money: 'money',
  date: 'date',
  enum: 'enum',
  phone: 'phone',
  email: 'email',
  /** Resolved against records already on file — a company name to its id. */
  reference: 'reference',
  /** Last four digits only. There is no field kind for a whole Aadhaar. */
  aadhaarLast4: 'aadhaar_last4',
} as const

export type FieldKind = (typeof FIELD_KINDS)[keyof typeof FIELD_KINDS]

export type ImportOption = {
  readonly value: string
  readonly label: string
  /** Other words a file might spell this option with. Matched case-insensitively. */
  readonly synonyms?: readonly string[]
}

export type ImportField = {
  readonly key: string
  readonly label: string
  readonly kind: FieldKind
  /** A row missing this fails. Everything else is optional and stays absent. */
  readonly required?: boolean
  /** Headings this field should auto-map from, beyond its key and label. */
  readonly synonyms?: readonly string[]
  /** Required when `kind` is `enum`. */
  readonly options?: readonly ImportOption[]
  /** Required when `kind` is `reference`; names the lookup the caller supplies. */
  readonly resolverKey?: string
  /** One line under the field in the mapping step. */
  readonly help?: string
  /**
   * What is recorded when this field is not mapped at all, in words.
   *
   * Present only where a default is genuinely defensible — a status, a mode, a
   * retention class. **Never on a money field**: an amount nobody typed stays
   * absent (D3). The confirmation lists one of these per unmapped field, so a
   * default is something the operator approved rather than something the
   * importer did quietly.
   */
  readonly defaultNote?: string
  /** Shown masked in every preview, every error sheet and every export. */
  readonly sensitive?: boolean
  /** What goes in the template's example column. */
  readonly example?: string
}

export type ImportSpec = {
  readonly key: string
  /** "Customers". The hub lists these. */
  readonly label: string
  readonly noun: string
  readonly nounPlural: string
  /** One sentence: what arrives on the books when this file is committed. */
  readonly summary: string
  readonly sheetName: string
  readonly fields: readonly ImportField[]
  /**
   * The fields that together identify a record already on file. A match is a
   * warning with a skip decision, never a hard failure — a re-uploaded file is
   * the normal case, not an error.
   */
  readonly identity: readonly string[]
  /**
   * Whether the MVP can genuinely write this entity through a repository.
   *
   * False is a real answer and is said on screen. An importer that pretends to
   * commit is worse than one that says it cannot: the operator finds out at the
   * point where they trusted it.
   */
  readonly writable: boolean
  /** One honest sentence, shown wherever `writable` is false. */
  readonly notWritableReason?: string
  /** What committing this file does, in the confirmation. One sentence. */
  readonly commitNote?: string
}

export function fieldOf(spec: ImportSpec, key: string): ImportField | undefined {
  return spec.fields.find((field) => field.key === key)
}

export function requiredFields(spec: ImportSpec): readonly ImportField[] {
  return spec.fields.filter((field) => field.required === true)
}

/** The heading written into a template, and matched back out of an upload. */
export function templateHeading(field: ImportField): string {
  return field.required === true ? `${field.label} *` : field.label
}

/**
 * The download that makes the feature usable: the exact headings, and two rows
 * showing the shapes the parsers accept.
 */
export function templateSheet(spec: ImportSpec): Sheet {
  const header = spec.fields.map(templateHeading)
  const example = spec.fields.map((field) => field.example ?? '')
  const blank = spec.fields.map(() => '')
  return makeSheet(spec.sheetName, header, [example, blank])
}

/** `customers-import-template.xlsx`. */
export function templateFileName(spec: ImportSpec, extension: 'xlsx' | 'csv'): string {
  return `${spec.key}-import-template.${extension}`
}
