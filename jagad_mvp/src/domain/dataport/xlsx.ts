/**
 * Real `.xlsx`, with no dependency — plan FR-02.4 and the owner's flagship gap.
 *
 * An `.xlsx` file is a ZIP of XML parts, so this module is the smallest honest
 * OOXML package a spreadsheet program will open, written over `zip.ts`.
 *
 * The writer uses **inline strings** (`t="inlineStr"`) rather than a shared
 * string table. A shared table is smaller for repetitive data and is the second
 * thing to add if a file ever gets big; it is also a second index to keep
 * consistent, and correctness beat size here. The reader handles both, because
 * Excel always writes the shared table.
 *
 * Three details that break naive readers, all handled below:
 *
 *   **Sparse cells.** Excel omits empty cells entirely, so `<c r="C2">` is the
 *   third column of row 2 and not the first cell of that row. Everything is
 *   placed by its A1 reference, never by its position in the XML.
 *
 *   **Sparse rows.** A row with nothing in it is simply absent. Gaps are refilled
 *   with blank rows so that "row 14" in an error message is row 14 in the
 *   operator's Excel window.
 *
 *   **Dates are numbers.** A date cell is a serial count with a display format,
 *   and the format lives in a part this reader does not read. So a number stays a
 *   number here, and `validate.ts` converts it only where the column's spec says
 *   the column is a date. Guessing would turn a policy number into 1974.
 */

import { cellAt, makeSheet, rectangular, safeSheetName } from './sheet'
import type { Sheet } from './sheet'
import { readZip, writeZip } from './zip'

const SHEET_PART = 'xl/worksheets/sheet1.xml'
const SHARED_STRINGS_PART = 'xl/sharedStrings.xml'
const WORKBOOK_PART = 'xl/workbook.xml'

/** Guards against a corrupt row reference asking for an array of a billion rows. */
const MAX_ROWS = 200_000

/* ------------------------------------------------------------ A1 references */

/** 0 → A, 25 → Z, 26 → AA. Bijective base 26, which is not quite base 26. */
export function columnName(index: number): string {
  let name = ''
  let n = index
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  }
  return name
}

/** "C" → 2, "AA" → 26. Returns -1 when the reference has no column letters. */
export function columnIndex(reference: string): number {
  let value = 0
  let seen = 0
  for (const char of reference) {
    const code = char.charCodeAt(0)
    if (code >= 65 && code <= 90) {
      value = value * 26 + (code - 64)
      seen += 1
    } else if (code >= 97 && code <= 122) {
      value = value * 26 + (code - 96)
      seen += 1
    } else {
      break
    }
  }
  return seen === 0 ? -1 : value - 1
}

/* --------------------------------------------------------------------- XML */

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

/**
 * Escapes for XML and drops the control characters XML 1.0 cannot carry.
 *
 * A stray 0x00 or 0x1F in a customer's exported name makes the whole workbook
 * unreadable, and "the export is corrupt" is a worse outcome than "one invisible
 * character was dropped".
 */
export function escapeXml(value: string): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue
    out += XML_ESCAPES[char] ?? char
  }
  return out
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

export function unescapeXml(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body] ?? whole
  })
}

/* ----------------------------------------------------------------- writing */

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function contentTypes(): string {
  return (
    `${DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>'
  )
}

function packageRels(): string {
  return (
    `${DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'
  )
}

function workbookXml(name: string): string {
  return (
    `${DECLARATION}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${escapeXml(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
  )
}

function workbookRels(): string {
  return (
    `${DECLARATION}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>'
  )
}

function cellXml(value: string, column: number, row: number): string {
  // An empty cell is omitted rather than written empty. That is what Excel does,
  // and it is what makes the reader's sparse handling load-bearing.
  if (value === '') return ''
  return (
    `<c r="${columnName(column)}${row}" t="inlineStr"><is><t xml:space="preserve">` +
    `${escapeXml(value)}</t></is></c>`
  )
}

function sheetXml(sheet: Sheet): string {
  const padded = rectangular(sheet)
  const lines: string[] = []
  const all = [padded.header, ...padded.rows]

  for (let r = 0; r < all.length; r += 1) {
    const row = all[r] ?? []
    const cells = row.map((value, c) => cellXml(value, c, r + 1)).join('')
    lines.push(cells === '' ? `<row r="${r + 1}"/>` : `<row r="${r + 1}">${cells}</row>`)
  }

  return (
    `${DECLARATION}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${lines.join('')}</sheetData></worksheet>`
  )
}

/**
 * The workbook, as bytes.
 *
 * Async only so that reader and writer read the same way at every call site; the
 * stored-entry writer needs no compressor and does no I/O.
 */
export function writeXlsx(sheet: Sheet): Promise<Uint8Array> {
  const name = safeSheetName(sheet.name)
  return Promise.resolve(
    writeZip([
      { name: '[Content_Types].xml', data: encode(contentTypes()) },
      { name: '_rels/.rels', data: encode(packageRels()) },
      { name: WORKBOOK_PART, data: encode(workbookXml(name)) },
      { name: 'xl/_rels/workbook.xml.rels', data: encode(workbookRels()) },
      { name: SHEET_PART, data: encode(sheetXml({ ...sheet, name })) },
    ]),
  )
}

/* ----------------------------------------------------------------- reading */

const SI_PATTERN = /<si\b[^>]*(?:\/>|>([\s\S]*?)<\/si>)/g
const T_PATTERN = /<t\b[^>]*(?:\/>|>([\s\S]*?)<\/t>)/g
const ROW_PATTERN = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g
const CELL_PATTERN = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
const V_PATTERN = /<v\b[^>]*(?:\/>|>([\s\S]*?)<\/v>)/
const IS_PATTERN = /<is\b[^>]*>([\s\S]*?)<\/is>/

function attribute(attrs: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`).exec(attrs)
  return match?.[1] ?? null
}

function joinRuns(fragment: string): string {
  let text = ''
  T_PATTERN.lastIndex = 0
  let match = T_PATTERN.exec(fragment)
  while (match !== null) {
    text += unescapeXml(match[1] ?? '')
    match = T_PATTERN.exec(fragment)
  }
  return text
}

function readSharedStrings(xml: string): string[] {
  const strings: string[] = []
  SI_PATTERN.lastIndex = 0
  let match = SI_PATTERN.exec(xml)
  while (match !== null) {
    strings.push(joinRuns(match[1] ?? ''))
    match = SI_PATTERN.exec(xml)
  }
  return strings
}

/** The worksheet's own name, so a re-export keeps the tab the operator recognised. */
function readSheetName(xml: string | undefined): string {
  if (xml === undefined) return 'Sheet1'
  const match = /<sheet\b[^>]*\bname\s*=\s*"([^"]*)"/.exec(xml)
  return match?.[1] === undefined ? 'Sheet1' : unescapeXml(match[1])
}

/**
 * One cell's text, by its declared type.
 *
 * Numbers, booleans, formula strings and errors all keep their literal text: a
 * number is not turned into a date here, because the format that would say so
 * lives in a part this reader does not read. See the header note.
 */
function readCellText(type: string | null, inner: string, shared: readonly string[]): string {
  if (type === 'inlineStr') return joinRuns(IS_PATTERN.exec(inner)?.[1] ?? inner)
  if (type === 's') {
    const index = Number.parseInt(unescapeXml(V_PATTERN.exec(inner)?.[1] ?? ''), 10)
    return Number.isFinite(index) ? (shared[index] ?? '') : ''
  }
  return unescapeXml(V_PATTERN.exec(inner)?.[1] ?? '')
}

function decodePart(parts: Map<string, Uint8Array>, name: string): string | undefined {
  const bytes = parts.get(name)
  return bytes === undefined ? undefined : new TextDecoder().decode(bytes)
}

/**
 * The first worksheet of a workbook, as a `Sheet`.
 *
 * Only sheet 1 is read. An agency's export is one table; a workbook with a
 * second tab of notes should not silently import its notes, and choosing a tab
 * is a feature to add when somebody asks for it rather than a guess to make now.
 */
export async function readXlsx(bytes: Uint8Array): Promise<Sheet> {
  const parts = await readZip(bytes)
  const sheetXmlText = decodePart(parts, SHEET_PART)
  if (sheetXmlText === undefined) {
    throw new Error(
      'This workbook has no first worksheet this reader can find. Re-save it from Excel as .xlsx, or upload it as CSV.',
    )
  }

  const shared = readSharedStrings(decodePart(parts, SHARED_STRINGS_PART) ?? '')
  const name = readSheetName(decodePart(parts, WORKBOOK_PART))

  const byRow = new Map<number, string[]>()
  let maxRow = 0
  let width = 0
  let fallbackRow = 0

  ROW_PATTERN.lastIndex = 0
  let rowMatch = ROW_PATTERN.exec(sheetXmlText)
  while (rowMatch !== null) {
    const declared = attribute(rowMatch[1] ?? '', 'r')
    const rowNumber = declared === null ? fallbackRow + 1 : Number.parseInt(declared, 10)
    fallbackRow = rowNumber

    if (!Number.isFinite(rowNumber) || rowNumber < 1 || rowNumber > MAX_ROWS) {
      throw new Error(`This workbook names row ${declared ?? '?'}, which is outside what can be read.`)
    }
    if (rowNumber > maxRow) maxRow = rowNumber

    const cells: string[] = []
    const body = rowMatch[2] ?? ''
    let nextColumn = 0

    CELL_PATTERN.lastIndex = 0
    let cellMatch = CELL_PATTERN.exec(body)
    while (cellMatch !== null) {
      const attrs = cellMatch[1] ?? ''
      const inner = cellMatch[2] ?? ''
      const reference = attribute(attrs, 'r')
      const column = reference === null ? nextColumn : columnIndex(reference)
      const at = column < 0 ? nextColumn : column
      nextColumn = at + 1

      const text = readCellText(attribute(attrs, 't'), inner, shared)

      while (cells.length < at) cells.push('')
      cells[at] = text
      if (cells.length > width) width = cells.length
      cellMatch = CELL_PATTERN.exec(body)
    }

    byRow.set(rowNumber, cells)
    rowMatch = ROW_PATTERN.exec(sheetXmlText)
  }

  if (maxRow === 0) return makeSheet(name, [], [])

  const at = (rowNumber: number): string[] => {
    const cells = byRow.get(rowNumber) ?? []
    return Array.from({ length: width }, (_unused, index) => cellAt(cells, index))
  }

  const rows: string[][] = []
  for (let rowNumber = 2; rowNumber <= maxRow; rowNumber += 1) rows.push(at(rowNumber))

  return makeSheet(name, at(1), rows)
}
