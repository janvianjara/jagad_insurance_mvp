/**
 * The browser edge — a dropped file in, a downloaded file out.
 *
 * Everything format-shaped lives in `src/domain/dataport`; this module holds
 * only the two things that genuinely need a browser: reading a `File` and
 * handing bytes to the user as a download.
 *
 * The format is decided by looking at the bytes, not by trusting the file name.
 * An `.xls` that is really an `.xlsx`, or an export renamed by hand, is common
 * enough that the first four bytes — `PK`, the ZIP signature every
 * OOXML package starts with — are the honest test. Only if the file is not a ZIP
 * is it read as delimited text.
 */

import { parseCsv, readXlsx, toCsv, writeXlsx } from '../../domain/dataport'
import type { Sheet } from '../../domain/dataport'

/** What the drop zone accepts. Kept in one place so the hint cannot drift from it. */
export const IMPORT_ACCEPT = '.xlsx,.csv,.tsv,.txt'
export const IMPORT_ACCEPT_HINT = 'Excel (.xlsx), CSV or tab-separated text'

export const EXPORT_FORMATS = { xlsx: 'xlsx', csv: 'csv' } as const
export type ExportFormat = (typeof EXPORT_FORMATS)[keyof typeof EXPORT_FORMATS]

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04] as const

function looksLikeZip(bytes: Uint8Array): boolean {
  return ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

/** A dropped file as a `Sheet`, whatever it turned out to be. */
export async function readSheetFromFile(file: File): Promise<Sheet> {
  const bytes = new Uint8Array(await file.arrayBuffer())

  if (bytes.length === 0) {
    throw new Error('That file is empty.')
  }

  if (looksLikeZip(bytes)) return readXlsx(bytes)

  const text = new TextDecoder().decode(bytes)
  const sheet = parseCsv(text, { name: file.name.replace(/\.[^.]+$/, '') })
  if (sheet.header.length === 0) {
    throw new Error('That file has no heading row, so there is nothing to map columns from.')
  }
  return sheet
}

export const MIME_TYPES: Readonly<Record<ExportFormat, string>> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
}

/** The bytes of a sheet in one format. Split out so a test can assert them. */
export async function sheetBytes(sheet: Sheet, format: ExportFormat): Promise<Uint8Array> {
  if (format === EXPORT_FORMATS.xlsx) return writeXlsx(sheet)
  return new TextEncoder().encode(toCsv(sheet))
}

/**
 * Hands the file to the browser.
 *
 * Guarded rather than assumed: jsdom has no `createObjectURL`, and a download
 * helper that throws under test is a helper whose callers cannot be tested. The
 * caller gets `false` and can say so on screen.
 */
export async function downloadSheet(
  sheet: Sheet,
  fileName: string,
  format: ExportFormat,
): Promise<boolean> {
  const bytes = await sheetBytes(sheet, format)
  const url = globalThis.URL

  if (typeof url?.createObjectURL !== 'function' || typeof document === 'undefined') return false

  const blob = new Blob([bytes as BlobPart], { type: MIME_TYPES[format] })
  const href = url.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  url.revokeObjectURL(href)
  return true
}
