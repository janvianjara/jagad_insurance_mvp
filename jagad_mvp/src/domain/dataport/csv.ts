/**
 * CSV, to RFC 4180 — the format most agency books actually arrive in.
 *
 * Written by hand rather than pulled from npm, because the whole of RFC 4180 is
 * a small state machine and the interesting parts are the ones a naive
 * `split(',')` gets wrong: a quoted field holding a comma, a quoted field
 * holding a newline, an escaped quote written as two quotes, CRLF line endings
 * from Windows Excel, and the UTF-8 byte-order mark Excel puts at the front of
 * every file it saves.
 *
 * Two deliberate choices:
 *
 *   The delimiter is detected rather than assumed. A European or Gujarati Excel
 *   install writes semicolons, and a copy out of a browser table writes tabs. An
 *   importer that assumes commas turns those files into one enormous column, and
 *   the operator has no way to tell why.
 *
 *   Nothing is trimmed and nothing is coerced. `007` stays `007` and ` Rakesh `
 *   keeps its spaces; the spec decides what a column means, and trimming here
 *   would silently rewrite data before anybody had seen it.
 */

import { cellAt, makeSheet, rectangular } from './sheet'
import type { Sheet } from './sheet'

export const CSV_DELIMITERS = {
  comma: ',',
  semicolon: ';',
  tab: '\t',
  pipe: '|',
} as const

export type CsvDelimiter = (typeof CSV_DELIMITERS)[keyof typeof CSV_DELIMITERS]

const BOM = '﻿'
const QUOTE = '"'

/** Strips Excel's byte-order mark. Left in place it becomes part of the first heading. */
export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(1) : text
}

/**
 * Which separator this file uses, decided on the header line alone.
 *
 * The header is the right line to read: it is the one line guaranteed to hold
 * every separator, and unlike a data row it rarely holds free text with commas
 * in it. Ties go to the comma, which is what the template downloads use.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const firstLine = stripBom(text).split(/\r\n|\n|\r/)[0] ?? ''
  const candidates: readonly CsvDelimiter[] = [
    CSV_DELIMITERS.comma,
    CSV_DELIMITERS.semicolon,
    CSV_DELIMITERS.tab,
    CSV_DELIMITERS.pipe,
  ]

  let best: CsvDelimiter = CSV_DELIMITERS.comma
  let bestCount = 0
  for (const candidate of candidates) {
    const count = countOutsideQuotes(firstLine, candidate)
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === QUOTE) {
      if (quoted && line[i + 1] === QUOTE) {
        i += 1
        continue
      }
      quoted = !quoted
      continue
    }
    if (!quoted && char === delimiter) count += 1
  }
  return count
}

/**
 * The whole of RFC 4180, as one pass.
 *
 * `rows` never includes a trailing empty record: a file that ends with a newline
 * is the normal case, not a file with a blank last row, and treating it as one
 * puts a phantom failing row on every import.
 */
export function parseCsvRows(text: string, delimiter: string): string[][] {
  const source = stripBom(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let fieldStarted = false

  const endField = () => {
    row.push(field)
    field = ''
    fieldStarted = false
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]

    if (quoted) {
      if (char === QUOTE) {
        if (source[i + 1] === QUOTE) {
          field += QUOTE
          i += 1
          continue
        }
        quoted = false
        continue
      }
      field += char
      continue
    }

    if (char === QUOTE && !fieldStarted) {
      quoted = true
      fieldStarted = true
      continue
    }

    if (char === delimiter) {
      endField()
      continue
    }

    if (char === '\r') {
      // CRLF and a lone CR are both line ends. Excel on Windows writes the first.
      if (source[i + 1] === '\n') i += 1
      endRow()
      continue
    }

    if (char === '\n') {
      endRow()
      continue
    }

    field += char
    fieldStarted = true
  }

  // A file that ends mid-record still has that record; a file that ended with a
  // newline has nothing pending, and must not gain a blank row.
  if (field.length > 0 || row.length > 0 || fieldStarted) endRow()

  return rows
}

export type ParseCsvOptions = {
  readonly delimiter?: string
  readonly name?: string
}

/**
 * A file's text as a `Sheet`. The first non-blank line is the header; everything
 * after it is data, blank lines included — a blank row inside a file is a row the
 * operator can see in Excel, so it is shown and skipped rather than deleted.
 */
export function parseCsv(text: string, options: ParseCsvOptions = {}): Sheet {
  const delimiter = options.delimiter ?? detectDelimiter(text)
  const rows = parseCsvRows(text, delimiter)
  if (rows.length === 0) return makeSheet(options.name ?? 'Sheet1', [], [])

  const [header, ...rest] = rows
  return rectangular(makeSheet(options.name ?? 'Sheet1', header ?? [], rest))
}

/** Quotes a field only when it has to be quoted, which is what Excel itself does. */
function encodeField(value: string, delimiter: string): string {
  const needsQuotes =
    value.includes(delimiter) ||
    value.includes(QUOTE) ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.startsWith(' ') ||
    value.endsWith(' ')
  if (!needsQuotes) return value
  return `${QUOTE}${value.split(QUOTE).join(QUOTE + QUOTE)}${QUOTE}`
}

export type ToCsvOptions = {
  readonly delimiter?: string
  /**
   * Excel on Windows needs the byte-order mark to read a UTF-8 file as UTF-8;
   * without it a Gujarati name opens as mojibake. On by default for that reason.
   */
  readonly bom?: boolean
  readonly newline?: '\r\n' | '\n'
}

export function toCsv(sheet: Sheet, options: ToCsvOptions = {}): string {
  const delimiter = options.delimiter ?? CSV_DELIMITERS.comma
  const newline = options.newline ?? '\r\n'
  const padded = rectangular(sheet)
  const lines = [padded.header, ...padded.rows].map((row) =>
    row.map((cell) => encodeField(cell, delimiter)).join(delimiter),
  )
  const body = lines.join(newline) + newline
  return (options.bom ?? true) ? BOM + body : body
}

/** Reads one column out of a sheet, for a mapping preview. */
export function columnSample(sheet: Sheet, index: number, limit = 3): readonly string[] {
  if (index < 0) return []
  return sheet.rows.slice(0, limit).map((row) => cellAt(row, index))
}
