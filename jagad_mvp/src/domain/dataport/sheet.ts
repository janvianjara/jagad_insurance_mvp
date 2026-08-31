/**
 * The common currency of import and export — one rectangle of text.
 *
 * CSV and XLSX are two spellings of the same thing, and every other module here
 * reads or writes this shape rather than a format. Mapping, validation, the
 * preview table and the error-rows download therefore have no idea which file
 * the operator dropped, and adding a third format later is one converter rather
 * than a second pipeline.
 *
 * Everything is a string. A spreadsheet cell has no type until a column says
 * what it is — `1,234.35` is money in one column and a policy number in another,
 * and `01/04/2025` is only a date because the spec calls it one. Typing happens
 * once, in `validate.ts`, against the spec. Guessing it earlier is how importers
 * turn `007` into `7` and lose a customer's account number.
 */

export type Sheet = {
  /** The worksheet name. Excel refuses some characters; `safeSheetName` fixes them. */
  readonly name: string
  readonly header: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

export function makeSheet(
  name: string,
  header: readonly string[],
  rows: readonly (readonly string[])[],
): Sheet {
  return { name: safeSheetName(name), header, rows }
}

/**
 * The cell at `index`, or the empty string.
 *
 * Rows arrive ragged from every real file — a trailing empty column is dropped
 * by one exporter and padded by another — so every read goes through here and a
 * short row is simply a row whose later cells are empty.
 */
export function cellAt(row: readonly string[], index: number): string {
  if (index < 0 || index >= row.length) return ''
  return row[index] ?? ''
}

/** True when nothing in the row carries a character. Blank lines are skipped, not failed. */
export function isBlankRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim().length === 0)
}

export function withoutBlankRows(sheet: Sheet): Sheet {
  return { ...sheet, rows: sheet.rows.filter((row) => !isBlankRow(row)) }
}

/**
 * Excel's rules for a worksheet name: at most 31 characters, and none of
 * `[ ] : * ? / \`. A file that breaks either opens as "unreadable content",
 * which reads to an operator as "the export is broken".
 */
const FORBIDDEN_IN_SHEET_NAME = /[[\]:*?/\\]/g

export function safeSheetName(name: string): string {
  const cleaned = name.replace(FORBIDDEN_IN_SHEET_NAME, ' ').trim()
  const trimmed = cleaned.length === 0 ? 'Sheet1' : cleaned
  return trimmed.length > 31 ? trimmed.slice(0, 31) : trimmed
}

/** Pads every row to the header's width. Used before writing a file out. */
export function rectangular(sheet: Sheet): Sheet {
  const width = sheet.header.length
  return {
    ...sheet,
    rows: sheet.rows.map((row) =>
      row.length === width ? row : Array.from({ length: width }, (_, i) => cellAt(row, i)),
    ),
  }
}
