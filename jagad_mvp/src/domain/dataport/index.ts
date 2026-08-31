/**
 * Data port — Excel and CSV in, Excel and CSV out.
 *
 * Pure and framework-free by construction: nothing here imports React, and
 * nothing imports the data layer. A `Sheet` is the only currency, so the
 * screens in `src/features/dataport/` decide what a customer is and this folder
 * only knows how to read a rectangle of text out of a file and put one back.
 *
 * The module boundary is worth stating because it is what makes the feature
 * testable: every rule that matters — how a rupee figure becomes paise, how a
 * date written six ways becomes one, which column a heading maps to, which row
 * is a duplicate — is a pure function with a unit test, and the wizard on top is
 * only the four screens that ask a person to approve what these functions found.
 */

export { cellAt, isBlankRow, makeSheet, rectangular, safeSheetName, withoutBlankRows } from './sheet'
export type { Sheet } from './sheet'

export {
  CSV_DELIMITERS,
  columnSample,
  detectDelimiter,
  parseCsv,
  parseCsvRows,
  stripBom,
  toCsv,
} from './csv'
export type { CsvDelimiter, ParseCsvOptions, ToCsvOptions } from './csv'

export { crc32, readZip, writeZip } from './zip'
export type { ZipEntry } from './zip'

export { columnIndex, columnName, escapeXml, readXlsx, unescapeXml, writeXlsx } from './xlsx'

export {
  FIELD_KINDS,
  fieldOf,
  requiredFields,
  templateFileName,
  templateHeading,
  templateSheet,
} from './spec'
export type { FieldKind, ImportField, ImportOption, ImportSpec } from './spec'

export { autoMap, missingRequired, normaliseHeading, unmappedColumns, withMapping } from './mapping'
export type { ColumnMap, MappingResult } from './mapping'

export {
  comparisonKey,
  digitsOf,
  excelSerialToIso,
  paiseToRupees,
  parseAadhaarLast4,
  parseEmail,
  parseIsoDate,
  parseMobile,
  parsePaise,
  parseWholeNumber,
} from './values'
export type { Parsed, ParseDateOptions } from './values'

export {
  ISSUE_SEVERITIES,
  ROW_OUTCOMES,
  countOf,
  errorSheet,
  identityFromValues,
  identityOf,
  isoOf,
  numberOf,
  paiseOf,
  rawOf,
  textOf,
  troubleFirst,
  validateRows,
} from './validate'
export type {
  ImportValue,
  IssueSeverity,
  RowIssue,
  RowOutcome,
  RowVerdict,
  ValidationContext,
  ValidationCounts,
  ValidationReport,
  ValueBag,
} from './validate'

export {
  cellAuto,
  cellDate,
  cellMoney,
  cellNumber,
  cellText,
  exportFileName,
  isForbiddenExportKey,
  renderCell,
  toSheet,
} from './export'
export type { ExportCell, ExportColumn } from './export'
