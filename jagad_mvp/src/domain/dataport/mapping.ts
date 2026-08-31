/**
 * Matching the columns of somebody else's spreadsheet to the fields of a spec.
 *
 * The importer's whole promise is "upload the book you already keep". That book
 * has a column called `Mobile No.`, or `Contact`, or `Phone Number`, and none of
 * them is `mobile`. So headings are normalised down to letters and digits and
 * matched against three things — the field key, its label, and the synonyms the
 * spec lists — and everything the auto-mapper decides is offered back to the
 * operator to override. Auto-mapping is a first guess shown for approval, never a
 * decision taken on the operator's behalf.
 *
 * Matching is deliberately not fuzzy. Levenshtein distance over headings turns
 * `Net Premium` into `Final Premium` at a threshold that also catches genuine
 * typos, and a wrong money column that looks right is the worst possible failure
 * for this product. An unmatched column is simply unmatched, and the mapping step
 * says so in lime.
 */

import type { ImportField, ImportSpec } from './spec'
import { templateHeading } from './spec'

/** Target field key to the index of the file column that fills it. */
export type ColumnMap = Readonly<Record<string, number>>

export type MappingResult = {
  readonly map: ColumnMap
  /** Column indexes in the file that no field claimed. Carried through untouched. */
  readonly unmappedColumns: readonly number[]
  /** Required field keys with no column behind them. The step blocks on these. */
  readonly missingRequired: readonly string[]
}

/**
 * `"Mobile No. *"` and `"mobile_no"` both become `"mobileno"`.
 *
 * Punctuation, spaces, underscores and case carry no meaning in a heading, and
 * the required-marker asterisk the template writes has to normalise away or a
 * downloaded template would not map back to itself.
 */
export function normaliseHeading(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function candidatesFor(field: ImportField): readonly string[] {
  return [
    field.key,
    field.label,
    templateHeading(field),
    ...(field.synonyms ?? []),
  ].map(normaliseHeading)
}

/**
 * The first guess.
 *
 * Fields are matched in spec order and a column is claimed once, so an earlier
 * field wins a heading two fields could both take — `mobile` before `altMobile`
 * for a column called `Mobile`, which is the order the spec already lists them
 * in and the order a person would read them.
 */
export function autoMap(header: readonly string[], spec: ImportSpec): MappingResult {
  const normalised = header.map(normaliseHeading)
  const taken = new Set<number>()
  const map: Record<string, number> = {}

  for (const field of spec.fields) {
    const wanted = candidatesFor(field)
    const index = normalised.findIndex(
      (heading, at) => heading !== '' && !taken.has(at) && wanted.includes(heading),
    )
    if (index >= 0) {
      map[field.key] = index
      taken.add(index)
    }
  }

  return {
    map,
    unmappedColumns: header.map((_heading, index) => index).filter((index) => !taken.has(index)),
    missingRequired: missingRequired(map, spec),
  }
}

/** Required fields with nothing behind them. Empty is the only state that commits. */
export function missingRequired(map: ColumnMap, spec: ImportSpec): readonly string[] {
  return spec.fields
    .filter((field) => field.required === true && map[field.key] === undefined)
    .map((field) => field.key)
}

/**
 * One override from the mapping step. `null` unmaps the field.
 *
 * A column may only fill one field, so choosing a column that another field
 * already holds takes it from that field rather than quietly duplicating it —
 * two fields reading one column is never what somebody meant, and it would make
 * the sample preview lie about both.
 */
export function withMapping(map: ColumnMap, fieldKey: string, index: number | null): ColumnMap {
  const next: Record<string, number> = {}
  for (const [key, value] of Object.entries(map)) {
    if (key === fieldKey) continue
    if (index !== null && value === index) continue
    next[key] = value
  }
  if (index !== null) next[fieldKey] = index
  return next
}

/** Columns in the file no field is reading, for the "left over" line. */
export function unmappedColumns(map: ColumnMap, header: readonly string[]): readonly number[] {
  const taken = new Set(Object.values(map))
  return header.map((_heading, index) => index).filter((index) => !taken.has(index))
}
