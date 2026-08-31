import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { RowData } from '@tanstack/react-table'
import { useResource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import { Popover } from '../../ui/surface'
import type { QueueConfig } from '../../components/WorkQueue'
import {
  isQueueNarrowed,
  queryFromQueueState,
  queueQueryKey,
  readQueueState,
} from '../../components/WorkQueue'
import type { QueueUrlSchema } from '../../components/WorkQueue'
import { exportFileName, toSheet } from '../../domain/dataport'
import type { ExportColumn } from '../../domain/dataport'
import { EXPORT_FORMATS, downloadSheet } from './file-io'
import type { ExportFormat } from './file-io'
import { columnsFromQueue } from './queue-export'
import styles from './dataport.module.css'

/**
 * Export, as an action on the queue rather than a screen of its own.
 *
 * The owner's IA rule and the product's own invariant agree here: the URL owns
 * list state, so "this view" is a thing with a definition — the filters, the
 * search and the sort in the address bar right now. That makes an export button
 * in the toolbar exact rather than approximate, and it is why the count on the
 * button is the count of the narrowed set and not of the table.
 *
 * The read goes through the queue's own `load`, so a filter the repository
 * applies is a filter the file has. There is no second query path that could
 * disagree with what the person is looking at.
 */

/** One page is what a person sees; this is what they may take away in one file. */
const EXPORT_LIMIT = 5_000

export type ExportActionProps<Row extends RowData> = {
  readonly config: QueueConfig<Row>
  /** A curated column set. Omitted, the queue's own columns are used. */
  readonly columns?: readonly ExportColumn<Row>[]
  /** Base for the file name. Omitted, the queue's title. */
  readonly fileName?: string
}

export function ExportAction<Row extends RowData>({
  config,
  columns,
  fileName,
}: ExportActionProps<Row>) {
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const schema: QueueUrlSchema = {
    filterKeys: (config.filters ?? []).map((filter) => filter.key),
    sortable: config.sortable ?? [],
    defaultSort: config.defaultSort ?? null,
    ...(config.pageSize === undefined ? {} : { defaultPageSize: config.pageSize }),
  }

  const state = readQueueState(params, schema)
  const query = queryFromQueueState(state)

  // The same read the queue itself does, for the same key — so the count on the
  // button is the count in the header, not a second opinion about it.
  const page = useResource(() => config.load(query), `export:${queueQueryKey(state)}`)
  const total = page.data?.total ?? 0
  const narrowed = isQueueNarrowed(state)

  async function run(format: ExportFormat, close: () => void) {
    setBusy(true)
    setProblem(null)
    try {
      const all = await config.load({ ...query, page: 1, pageSize: EXPORT_LIMIT })
      const sheet = toSheet(
        config.title,
        all.rows,
        columns ?? columnsFromQueue(config),
      )
      const name = exportFileName(fileName ?? config.title, format, new Date())
      const done = await downloadSheet(sheet, name, format)
      if (!done) setProblem('This browser would not accept the download.')
      else close()
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'The export could not be built.')
    } finally {
      setBusy(false)
    }
  }

  const label =
    page.status === 'ready'
      ? `Export ${total} ${total === 1 ? config.noun : (config.nounPlural ?? `${config.noun}s`)}`
      : 'Export'

  return (
    <Popover
      label="Export this view"
      placement="bottom-end"
      trigger={(triggerProps) => (
        <Button {...triggerProps} icon="upload" disabled={page.status !== 'ready' || total === 0}>
          {label}
        </Button>
      )}
    >
      {(close) => (
        <div className={styles.exportMenu}>
          <p className={styles.exportNote}>
            {narrowed
              ? 'Exports exactly what these filters are showing, in the order on screen.'
              : 'Exports the whole queue, in the order on screen.'}
            {total > EXPORT_LIMIT
              ? ` The first ${EXPORT_LIMIT} rows only — narrow the view to take the rest.`
              : ''}
          </p>
          <Button
            variant="primary"
            icon="doc"
            disabled={busy}
            onClick={() => void run(EXPORT_FORMATS.xlsx, close)}
          >
            Excel (.xlsx)
          </Button>
          <Button icon="doc" disabled={busy} onClick={() => void run(EXPORT_FORMATS.csv, close)}>
            CSV
          </Button>
          {problem === null ? null : (
            <p className={styles.exportNote} role="alert">
              {problem}
            </p>
          )}
        </div>
      )}
    </Popover>
  )
}
