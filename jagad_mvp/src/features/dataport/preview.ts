/**
 * What a person is allowed to see of the file they uploaded.
 *
 * Almost everything: a preview that hides the data defeats the point. The one
 * exception is the constitution's, and it is absolute — a sensitive column is
 * shown masked to its last four characters in the preview table, and is masked
 * again in the error-rows download, which is a file leaving the system.
 *
 * The rule lives here rather than in the two screens that need it, because a
 * screen can forget. `maskedCell` is the only way either of them reads a cell.
 */

import { cellAt } from '../../domain/dataport'
import type { ColumnMap, ImportField, ImportSpec, Sheet } from '../../domain/dataport'
import { FIELD_KINDS } from '../../domain/dataport'
import { maskValue } from '../../ui/type'

/** True for any field whose raw value must never be shown or exported in full. */
export function isSensitiveField(field: ImportField | undefined): boolean {
  if (field === undefined) return false
  return field.sensitive === true || field.kind === FIELD_KINDS.aadhaarLast4
}

/** One cell as the screen may render it. */
export function maskedCell(field: ImportField | undefined, raw: string): string {
  if (raw === '' || !isSensitiveField(field)) return raw
  return maskValue(raw, 'aadhaar')
}

/**
 * The uploaded sheet with every sensitive column masked.
 *
 * Used for the error-rows download. The operator gets their own rows back to fix
 * — but the file this system writes carries no value this system would refuse to
 * put on a screen.
 */
export function redactSheet(sheet: Sheet, map: ColumnMap, spec: ImportSpec): Sheet {
  const sensitiveColumns = new Set(
    spec.fields
      .filter((field) => isSensitiveField(field))
      .map((field) => map[field.key])
      .filter((column): column is number => column !== undefined),
  )

  if (sensitiveColumns.size === 0) return sheet

  return {
    ...sheet,
    rows: sheet.rows.map((row) =>
      sheet.header.map((_heading, index) => {
        const cell = cellAt(row, index)
        return sensitiveColumns.has(index) && cell !== '' ? maskValue(cell, 'aadhaar') : cell
      }),
    ),
  }
}
