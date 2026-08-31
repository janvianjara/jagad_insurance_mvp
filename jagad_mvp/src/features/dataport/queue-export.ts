/**
 * A queue's own columns, turned into export columns.
 *
 * This is what makes "export this view" true for **every** queue in the product
 * without a line of per-queue configuration. A `QueueConfig` already declares
 * what a row shows and what each column is called; the export reads those, pulls
 * the value off the row by the same accessor key, and lets the shape of the value
 * decide how it renders — integer paise become rupees, an ISO instant becomes a
 * date, a list becomes a semicolon-separated cell.
 *
 * What it deliberately does **not** do is render the column's `cell` function.
 * That returns React elements — a `<StatusPill>`, a `<RecordId>`, a `<Money>` —
 * and stringifying an element tree is how an export ends up full of
 * `[object Object]`. The underlying value is the honest thing to write, and it is
 * also the thing that can be read back in.
 *
 * A queue that wants a curated export passes its own columns instead. Nothing
 * here is compulsory.
 */

import type { RowData } from '@tanstack/react-table'
import type { QueueConfig } from '../../components/WorkQueue'
import type { DataTableColumn } from '../../ui/data'
import { cellAuto, isForbiddenExportKey } from '../../domain/dataport'
import type { ExportColumn } from '../../domain/dataport'

/** The parts of a TanStack column definition an export can honestly read. */
type ColumnShape = {
  readonly id?: string
  readonly accessorKey?: string | number
  readonly header?: unknown
}

function keyOf(column: DataTableColumn<never>): string | null {
  const shape = column as ColumnShape
  if (typeof shape.accessorKey === 'string') return shape.accessorKey
  if (typeof shape.accessorKey === 'number') return String(shape.accessorKey)
  return typeof shape.id === 'string' ? shape.id : null
}

/** "collectedAt" reads as "Collected at" when a column gave no text header. */
function humanise(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function columnsFromQueue<Row extends RowData>(
  config: QueueConfig<Row>,
): readonly ExportColumn<Row>[] {
  const columns: ExportColumn<Row>[] = []

  for (const column of config.columns) {
    const key = keyOf(column as DataTableColumn<never>)
    if (key === null || isForbiddenExportKey(key)) continue

    const header = (column as ColumnShape).header
    columns.push({
      key,
      header: typeof header === 'string' && header !== '' ? header : humanise(key),
      value: (row) => cellAuto((row as Readonly<Record<string, unknown>>)[key]),
    })
  }

  return columns
}
