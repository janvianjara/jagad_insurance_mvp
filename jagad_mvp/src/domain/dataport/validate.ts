/**
 * Checking a whole file before anything is written.
 *
 * The output is per row and per column, because that is the only shape an
 * operator can act on: a failing row names the column that failed and the reason
 * in the words of the file, so the fix is visible in Excel without anybody
 * decoding an error code.
 *
 * Two rules the shape enforces:
 *
 *   A **duplicate is a warning, not a failure.** Re-uploading last month's book
 *   with fifty new rows on the end is the normal way this feature gets used. The
 *   fifty land; the rest are recognised and skipped, and the receipt says so.
 *
 *   **Nothing is filled in.** A cell left empty produces an absent value, never a
 *   zero and never a default. For money that is D3, and it is the difference
 *   between a premium nobody recorded and a premium of nothing.
 */

import { cellAt } from './sheet'
import type { Sheet } from './sheet'
import type { ColumnMap } from './mapping'
import { FIELD_KINDS, fieldOf } from './spec'
import type { ImportField, ImportSpec } from './spec'
import {
  comparisonKey,
  parseAadhaarLast4,
  parseEmail,
  parseIsoDate,
  parseMobile,
  parsePaise,
  parseWholeNumber,
} from './values'
import { normaliseHeading } from './mapping'

export const ISSUE_SEVERITIES = { error: 'error', warning: 'warning' } as const
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[keyof typeof ISSUE_SEVERITIES]

export const ROW_OUTCOMES = {
  /** No errors, nothing like it on file. Will be created. */
  ready: 'ready',
  /** Something is wrong in a cell. Will not be created. */
  failed: 'failed',
  /** Matches an earlier row in this same file. */
  duplicateInFile: 'duplicate_in_file',
  /** Matches a record already on the books. */
  duplicateOnFile: 'duplicate_on_file',
} as const

export type RowOutcome = (typeof ROW_OUTCOMES)[keyof typeof ROW_OUTCOMES]

export type RowIssue = {
  readonly fieldKey: string
  /** The field's label, and the file's heading for the column it came from. */
  readonly label: string
  readonly heading: string
  /** Index into the source row. `null` when the field is not mapped at all. */
  readonly column: number | null
  readonly severity: IssueSeverity
  /** Already a sentence: "Mobile is not a ten-digit mobile number ("98250")." */
  readonly message: string
}

/**
 * One cell, typed. The union is what stops a caller reading paise off a date.
 */
export type ImportValue =
  | { readonly kind: 'empty'; readonly raw: string }
  | { readonly kind: 'text'; readonly raw: string; readonly text: string }
  | { readonly kind: 'number'; readonly raw: string; readonly number: number }
  | { readonly kind: 'money'; readonly raw: string; readonly paise: number }
  | { readonly kind: 'date'; readonly raw: string; readonly iso: string }
  | { readonly kind: 'option'; readonly raw: string; readonly option: string }
  | { readonly kind: 'reference'; readonly raw: string; readonly id: string }

export type ValueBag = Readonly<Record<string, ImportValue>>

export type RowVerdict = {
  /** The row number the operator sees in Excel. The header is row 1. */
  readonly rowNumber: number
  readonly cells: readonly string[]
  readonly values: ValueBag
  readonly errors: readonly RowIssue[]
  readonly warnings: readonly RowIssue[]
  readonly outcome: RowOutcome
  /** What this row claims to be, for duplicate reporting. Empty when unknowable. */
  readonly identity: string
}

export type ValidationCounts = {
  readonly total: number
  readonly ready: number
  readonly failed: number
  readonly duplicate: number
}

export type ValidationReport = {
  readonly verdicts: readonly RowVerdict[]
  readonly counts: ValidationCounts
}

export type ValidationContext = {
  /**
   * Resolves a reference column against records already on file. Returns the id,
   * or null when there is nothing by that name — which is an error naming the
   * value, so the operator can fix a spelling rather than guess.
   */
  readonly resolve?: (resolverKey: string, raw: string) => string | null
  /**
   * The identities already on the books, built with `identityOf` so the two sides
   * are normalised the same way. A match warns; it never fails.
   */
  readonly existingIdentities?: ReadonlySet<string>
}

/* ------------------------------------------------------------------ values */

function issue(
  field: ImportField,
  heading: string,
  column: number | null,
  severity: IssueSeverity,
  tail: string,
): RowIssue {
  return {
    fieldKey: field.key,
    label: field.label,
    heading,
    column,
    severity,
    message: `${field.label} ${tail}.`,
  }
}

function matchOption(field: ImportField, raw: string): string | null {
  const wanted = normaliseHeading(raw)
  for (const option of field.options ?? []) {
    const candidates = [option.value, option.label, ...(option.synonyms ?? [])].map(normaliseHeading)
    if (candidates.includes(wanted)) return option.value
  }
  return null
}

function optionList(field: ImportField): string {
  return (field.options ?? []).map((option) => option.label).join(', ')
}

type CellOutcome = { readonly value: ImportValue | null; readonly issue: RowIssue | null }

function readCell(
  field: ImportField,
  raw: string,
  heading: string,
  column: number,
  context: ValidationContext,
): CellOutcome {
  const trimmed = raw.trim()

  if (trimmed === '') {
    if (field.required === true) {
      return { value: null, issue: issue(field, heading, column, ISSUE_SEVERITIES.error, 'is required and this row leaves it empty') }
    }
    // Absent, and left absent. Nothing is defaulted here — see the header note.
    return { value: { kind: 'empty', raw }, issue: null }
  }

  switch (field.kind) {
    case FIELD_KINDS.text:
      return { value: { kind: 'text', raw, text: trimmed }, issue: null }

    case FIELD_KINDS.number: {
      const parsed = parseWholeNumber(trimmed)
      return parsed.ok
        ? { value: { kind: 'number', raw, number: parsed.value }, issue: null }
        : { value: null, issue: issue(field, heading, column, ISSUE_SEVERITIES.error, parsed.reason) }
    }

    case FIELD_KINDS.money: {
      const parsed = parsePaise(trimmed)
      return parsed.ok
        ? { value: { kind: 'money', raw, paise: parsed.value }, issue: null }
        : { value: null, issue: issue(field, heading, column, ISSUE_SEVERITIES.error, parsed.reason) }
    }

    case FIELD_KINDS.date: {
      const parsed = parseIsoDate(trimmed, { allowSerial: true })
      return parsed.ok
        ? { value: { kind: 'date', raw, iso: parsed.value }, issue: null }
        : { value: null, issue: issue(field, heading, column, ISSUE_SEVERITIES.error, parsed.reason) }
    }

    case FIELD_KINDS.phone: {
      const parsed = parseMobile(trimmed)
      return parsed.ok
        ? { value: { kind: 'text', raw, text: parsed.value }, issue: null }
        : { value: null, issue: issue(field, heading, column, ISSUE_SEVERITIES.error, parsed.reason) }
    }

    case FIELD_KINDS.email: {
      const parsed = parseEmail(trimmed)
      return parsed.ok
        ? { value: { kind: 'text', raw, text: parsed.value }, issue: null }
        : { value: null, issue: issue(field, heading, column, ISSUE_SEVERITIES.error, parsed.reason) }
    }

    case FIELD_KINDS.aadhaarLast4: {
      const parsed = parseAadhaarLast4(trimmed)
      return parsed.ok
        ? { value: { kind: 'text', raw, text: parsed.value }, issue: null }
        : { value: null, issue: issue(field, heading, column, ISSUE_SEVERITIES.error, parsed.reason) }
    }

    case FIELD_KINDS.enum: {
      const matched = matchOption(field, trimmed)
      return matched === null
        ? {
            value: null,
            issue: issue(
              field,
              heading,
              column,
              ISSUE_SEVERITIES.error,
              `does not name one of the allowed values ("${trimmed}"). Use one of: ${optionList(field)}`,
            ),
          }
        : { value: { kind: 'option', raw, option: matched }, issue: null }
    }

    case FIELD_KINDS.reference: {
      const resolved = context.resolve?.(field.resolverKey ?? field.key, trimmed) ?? null
      return resolved === null
        ? {
            value: null,
            issue: issue(
              field,
              heading,
              column,
              ISSUE_SEVERITIES.error,
              `does not match anything on file ("${trimmed}")`,
            ),
          }
        : { value: { kind: 'reference', raw, id: resolved }, issue: null }
    }

    default:
      return { value: { kind: 'text', raw, text: trimmed }, issue: null }
  }
}

/* -------------------------------------------------------------- accessors */

export function textOf(values: ValueBag, key: string): string | null {
  const value = values[key]
  if (value === undefined) return null
  if (value.kind === 'text') return value.text
  if (value.kind === 'option') return value.option
  if (value.kind === 'reference') return value.id
  if (value.kind === 'date') return value.iso
  return null
}

export function paiseOf(values: ValueBag, key: string): number | null {
  const value = values[key]
  return value !== undefined && value.kind === 'money' ? value.paise : null
}

export function isoOf(values: ValueBag, key: string): string | null {
  const value = values[key]
  return value !== undefined && value.kind === 'date' ? value.iso : null
}

export function numberOf(values: ValueBag, key: string): number | null {
  const value = values[key]
  return value !== undefined && value.kind === 'number' ? value.number : null
}

export function rawOf(values: ValueBag, key: string): string {
  return values[key]?.raw ?? ''
}

/* ------------------------------------------------------------- the report */

/** The identity a row claims. Both sides of a duplicate check must build it here. */
export function identityOf(spec: ImportSpec, values: ValueBag): string {
  if (spec.identity.length === 0) return ''
  const parts = spec.identity.map((key) => {
    const text = textOf(values, key)
    return text === null ? '' : comparisonKey(text)
  })
  return parts.some((part) => part === '') ? '' : parts.join('|')
}

/** Builds one side of the duplicate check from values already on the books. */
export function identityFromValues(parts: readonly (string | null | undefined)[]): string {
  if (parts.length === 0) return ''
  const normalised = parts.map((part) => (part === null || part === undefined ? '' : comparisonKey(part)))
  return normalised.some((part) => part === '') ? '' : normalised.join('|')
}

function headingFor(sheet: Sheet, column: number | null): string {
  return column === null ? '' : cellAt(sheet.header, column)
}

/**
 * The whole file, checked.
 *
 * Row numbers are the spreadsheet's own: the header is row 1, so the first data
 * row is row 2, which is what the operator sees when they go back to fix it.
 */
export function validateRows(
  sheet: Sheet,
  map: ColumnMap,
  spec: ImportSpec,
  context: ValidationContext = {},
): ValidationReport {
  const seen = new Set<string>()
  const verdicts: RowVerdict[] = []

  sheet.rows.forEach((cells, index) => {
    const rowNumber = index + 2
    if (cells.every((cell) => cell.trim() === '')) return

    const values: Record<string, ImportValue> = {}
    const errors: RowIssue[] = []
    const warnings: RowIssue[] = []

    for (const field of spec.fields) {
      const column = map[field.key]
      if (column === undefined) {
        if (field.required === true) {
          errors.push(
            issue(field, '', null, ISSUE_SEVERITIES.error, 'is required and no column in this file is mapped to it'),
          )
        }
        continue
      }
      const outcome = readCell(field, cellAt(cells, column), headingFor(sheet, column), column, context)
      if (outcome.value !== null) values[field.key] = outcome.value
      if (outcome.issue !== null) {
        if (outcome.issue.severity === ISSUE_SEVERITIES.error) errors.push(outcome.issue)
        else warnings.push(outcome.issue)
      }
    }

    const identity = identityOf(spec, values)
    let outcome: RowOutcome = errors.length > 0 ? ROW_OUTCOMES.failed : ROW_OUTCOMES.ready

    if (outcome === ROW_OUTCOMES.ready && identity !== '') {
      const identityField = fieldOf(spec, spec.identity[0] ?? '') ?? spec.fields[0]
      if (seen.has(identity)) {
        outcome = ROW_OUTCOMES.duplicateInFile
        if (identityField) {
          warnings.push(
            issue(
              identityField,
              headingFor(sheet, map[identityField.key] ?? null),
              map[identityField.key] ?? null,
              ISSUE_SEVERITIES.warning,
              'repeats a row earlier in this same file, so only the first will be created',
            ),
          )
        }
      } else if (context.existingIdentities?.has(identity) === true) {
        outcome = ROW_OUTCOMES.duplicateOnFile
        if (identityField) {
          warnings.push(
            issue(
              identityField,
              headingFor(sheet, map[identityField.key] ?? null),
              map[identityField.key] ?? null,
              ISSUE_SEVERITIES.warning,
              'is already on file, so this row will be skipped rather than creating a second record',
            ),
          )
        }
      }
      seen.add(identity)
    }

    verdicts.push({ rowNumber, cells, values, errors, warnings, outcome, identity })
  })

  return { verdicts, counts: countOf(verdicts) }
}

export function countOf(verdicts: readonly RowVerdict[]): ValidationCounts {
  let ready = 0
  let failed = 0
  let duplicate = 0
  for (const verdict of verdicts) {
    if (verdict.outcome === ROW_OUTCOMES.ready) ready += 1
    else if (verdict.outcome === ROW_OUTCOMES.failed) failed += 1
    else duplicate += 1
  }
  return { total: verdicts.length, ready, failed, duplicate }
}

/** Error rows first, so the thing that needs a person is the thing on screen. */
export function troubleFirst(verdicts: readonly RowVerdict[]): readonly RowVerdict[] {
  const rank = (verdict: RowVerdict): number => {
    if (verdict.outcome === ROW_OUTCOMES.failed) return 0
    if (verdict.outcome !== ROW_OUTCOMES.ready) return 1
    return 2
  }
  return [...verdicts].sort((a, b) => rank(a) - rank(b) || a.rowNumber - b.rowNumber)
}

/**
 * The rows that did not go through, as a sheet the operator can fix and re-upload.
 *
 * The single most useful thing the Check step offers a real agency: the original
 * columns, untouched, plus the row number they came from and one plain sentence
 * per row saying what to change. Re-uploading the corrected file maps
 * automatically, because the headings are the ones that came out of it.
 */
export function errorSheet(sheet: Sheet, verdicts: readonly RowVerdict[]): Sheet {
  const failing = verdicts.filter((verdict) => verdict.outcome === ROW_OUTCOMES.failed)
  return {
    name: 'Rows to fix',
    header: ['Row in your file', ...sheet.header, 'What to fix'],
    rows: failing.map((verdict) => [
      String(verdict.rowNumber),
      ...sheet.header.map((_heading, index) => cellAt(verdict.cells, index)),
      verdict.errors.map((error) => error.message).join(' '),
    ]),
  }
}
