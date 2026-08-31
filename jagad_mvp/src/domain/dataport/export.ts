/**
 * Rows on a screen, out to a file a person will open in Excel.
 *
 * Export is the easy half and it is still opinionated, because a file that
 * cannot be read back is not an export:
 *
 *   **Money is rupees with two decimals**, not paise. The system stores integer
 *   paise and this is the render edge, the same way `formatINR` is the render
 *   edge for a screen. `124850` becomes `1248.50` — no thousands separators and
 *   no currency symbol, because Excel must read the cell as a number and `₹1,248`
 *   is text.
 *
 *   **Dates are ISO `yyyy-MM-dd`.** Unambiguous in every locale, and the shape
 *   the importer reads back first.
 *
 *   **Ids and reference numbers stay text**, exactly as stored. A policy number
 *   is not an integer, and anything that lets Excel decide otherwise loses its
 *   leading zeros.
 *
 * Nothing is computed on the way out. A roll-up that is not on the row is not in
 * the file (D3).
 */

import { makeSheet } from './sheet'
import type { Sheet } from './sheet'
import { paiseToRupees } from './values'

export type ExportCell =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'money'; readonly paise: number | null }
  | { readonly kind: 'date'; readonly value: string | null }
  | { readonly kind: 'number'; readonly value: number | null }

export function cellText(value: string | null | undefined): ExportCell {
  return { kind: 'text', text: value ?? '' }
}

export function cellMoney(paise: number | null | undefined): ExportCell {
  return { kind: 'money', paise: paise ?? null }
}

export function cellDate(value: string | Date | null | undefined): ExportCell {
  if (value === null || value === undefined) return { kind: 'date', value: null }
  return { kind: 'date', value: value instanceof Date ? value.toISOString() : value }
}

export function cellNumber(value: number | null | undefined): ExportCell {
  return { kind: 'number', value: value ?? null }
}

export type ExportColumn<Row> = {
  readonly key: string
  readonly header: string
  readonly value: (row: Row) => ExportCell
}

const ISO_DATE_LIKE = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/

/** Duck-typed `Money`: integer paise plus a currency, which is the stored shape. */
function isMoneyLike(value: unknown): value is { paise: number; currency: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { paise?: unknown }).paise === 'number' &&
    typeof (value as { currency?: unknown }).currency === 'string'
  )
}

/**
 * A cell for a value whose type is only known at runtime.
 *
 * This is what lets a queue export without anyone hand-writing a column list per
 * queue: the row is whatever the repository returned, and the shape of each value
 * says how to render it. Anything structural that is not money — a nested record,
 * a function — exports empty rather than as `[object Object]`, because a cell of
 * noise is worse than an empty one.
 */
export function cellAuto(value: unknown): ExportCell {
  if (value === null || value === undefined) return cellText('')
  if (isMoneyLike(value)) return cellMoney(value.paise)
  if (value instanceof Date) return cellDate(value)
  if (typeof value === 'number') return cellNumber(value)
  if (typeof value === 'boolean') return cellText(value ? 'Yes' : 'No')
  if (Array.isArray(value)) {
    return cellText(value.map((item) => renderCell(cellAuto(item))).filter((text) => text !== '').join('; '))
  }
  if (typeof value === 'string') {
    return ISO_DATE_LIKE.test(value) ? cellDate(value) : cellText(value)
  }
  return cellText('')
}

/** One cell as the text that goes in the file. */
export function renderCell(cell: ExportCell): string {
  switch (cell.kind) {
    case 'text':
      return cell.text
    case 'number':
      return cell.value === null ? '' : String(cell.value)
    case 'money':
      // Absent is empty, never `0.00`. An amount nobody recorded is not zero.
      return cell.paise === null ? '' : paiseToRupees(cell.paise)
    case 'date':
      return cell.value === null ? '' : cell.value.slice(0, 10)
    default:
      return ''
  }
}

/**
 * Fields that must never leave the system, whatever a caller asks for.
 *
 * The constitution allows the last four digits of an Aadhaar in staff UI and
 * nothing more, anywhere. An export is the easiest place in a product to leak a
 * field nobody meant to publish, so the rule is enforced here rather than trusted
 * to every caller — `aadhaarLast4` passes, `aadhaarNumber` cannot.
 */
export function isForbiddenExportKey(key: string): boolean {
  const lower = key.toLowerCase()
  if (!lower.includes('aadhaar')) return false
  return !lower.endsWith('last4')
}

/** The rows a queue is showing, as a sheet. */
export function toSheet<Row>(
  name: string,
  rows: readonly Row[],
  columns: readonly ExportColumn<Row>[],
): Sheet {
  const safe = columns.filter((column) => !isForbiddenExportKey(column.key))
  return makeSheet(
    name,
    safe.map((column) => column.header),
    rows.map((row) => safe.map((column) => renderCell(column.value(row)))),
  )
}

/** `collections-2026-08-31.xlsx`. Dated, because an export is a snapshot. */
export function exportFileName(base: string, extension: 'xlsx' | 'csv', now: Date): string {
  const stamp = now.toISOString().slice(0, 10)
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug === '' ? 'export' : slug}-${stamp}.${extension}`
}
