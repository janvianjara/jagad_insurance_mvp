import type { RowData } from '@tanstack/react-table'
import type { QueueConfig } from '../../components/WorkQueue'
import type { ExportColumn } from '../../domain/dataport'
import { ExportAction } from './ExportAction'
import { ImportAction } from './ImportAction'
import styles from './dataport.module.css'

export type QueueDataPortProps<Row extends RowData> = {
  readonly config: QueueConfig<Row>
  /** Set when this queue's entity has an `ImportSpec`. Omitted, only export shows. */
  readonly importSpecKey?: string
  readonly columns?: readonly ExportColumn<Row>[]
  readonly fileName?: string
  readonly onImported?: () => void
}

/**
 * The pair of toolbar actions a queue gets: export what is on screen, import
 * more of the same.
 *
 * It is a component rather than a `QueueConfig` field on purpose. `<WorkQueue>`
 * already takes an `actions` node for the page header, so a queue screen adds
 * both affordances with one prop and no shared file changes — which also means a
 * queue whose entity cannot be imported simply leaves `importSpecKey` out and
 * still gets its export.
 *
 * Export before import, left to right: reading is the commoner act and the safer
 * one, and the button that writes should not be the one under the cursor by
 * default.
 */
export function QueueDataPort<Row extends RowData>({
  config,
  importSpecKey,
  columns,
  fileName,
  onImported,
}: QueueDataPortProps<Row>) {
  return (
    <div className={styles.toolbar}>
      <ExportAction
        config={config}
        {...(columns === undefined ? {} : { columns })}
        {...(fileName === undefined ? {} : { fileName })}
      />
      {importSpecKey === undefined ? null : (
        <ImportAction
          specKey={importSpecKey}
          {...(onImported === undefined ? {} : { onCommitted: onImported })}
        />
      )}
    </div>
  )
}
