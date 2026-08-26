/**
 * The queue configuration surface — plan §6, "`WorkQueue`: one implementation,
 * configured per module", reused by all fifteen queue screens.
 *
 * This file is the contract, and it is the highest-leverage thing in the build:
 * every list screen from here on is an object of this shape rather than a table
 * somebody wrote again. So it holds only what a queue genuinely differs by —
 * what the columns are, what may be filtered, how a row's trouble is coloured,
 * what may be done to a selection, and where a row leads — and refuses the two
 * things that would let queues drift apart:
 *
 *   - There is no `render` escape hatch for the table. A queue that needs a
 *     different table is a different component, not a configured one.
 *   - There is no local page or filter state. `load` receives a `ListQuery` that
 *     came off the URL, which is what keeps the view reconstructible from it.
 *
 * `rowTarget` is a discriminated union rather than a string with optional
 * companions, so a queue that says `drawer` cannot forget to say what the drawer
 * contains.
 */

import type { ReactNode } from 'react'
import type { RowData } from '@tanstack/react-table'
import type { ListQuery, Page, SortSpec } from '../../data/repo'
import type { ConfirmChange } from '../guardrails'
import type { DataTableColumn } from '../../ui/data'
import type { IconName } from '../../ui/Icon'
import type { ButtonVariant } from '../../ui/Button'
import type { Severity } from '../../ui/tone'

export type QueueFilterOption = {
  readonly value: string
  readonly label: string
}

export type QueueFilter = {
  /** Must match a filter the repository declares, and must not be a reserved URL parameter. */
  readonly key: string
  readonly label: string
  readonly options: readonly QueueFilterOption[]
  /** Text for the "no choice made" option. */
  readonly anyLabel?: string
}

/** What a bulk action is handed: the ticked ids, plus whichever rows are on screen. */
export type QueueSelection<Row extends RowData> = {
  readonly ids: readonly string[]
  readonly rows: readonly Row[]
}

export type QueueActionOutcome = {
  readonly ok: boolean
  /** The receipt, or the machine's own refusal sentence. Rendered as written. */
  readonly message: string
}

/**
 * A bulk action. Every one of these is an outward mutation, so the shape forces
 * a `<ConfirmGate>` preview: `preview` is not optional, and `run` is only ever
 * reached from Confirm.
 */
export type QueueBulkAction<Row extends RowData> = {
  readonly key: string
  readonly label: string
  readonly icon?: IconName
  readonly variant?: ButtonVariant
  readonly confirmTitle: (selection: QueueSelection<Row>) => string
  /** The key/value preview of what will change. An empty list disables Confirm. */
  readonly preview: (selection: QueueSelection<Row>) => readonly ConfirmChange[]
  /** Who gets told, what cannot be undone. */
  readonly note?: (selection: QueueSelection<Row>) => ReactNode
  readonly confirmLabel?: string
  readonly run: (selection: QueueSelection<Row>) => Promise<QueueActionOutcome>
}

type QueueRowsToDrawer<Row extends RowData> = {
  /** The row's detail opens in the shell's right drawer, addressed by `?record=`. */
  readonly rowTarget: 'drawer'
  readonly drawerTitle: (row: Row) => string
  readonly drawerSubtitle?: (row: Row) => string | undefined
  readonly renderDrawer: (row: Row) => ReactNode
}

type QueueRowsToRoute<Row extends RowData> = {
  /** The row's detail is a screen of its own. */
  readonly rowTarget: 'route'
  readonly rowHref: (row: Row) => string
}

export type QueueRowTarget<Row extends RowData> = QueueRowsToDrawer<Row> | QueueRowsToRoute<Row>

type QueueBase<Row extends RowData> = {
  /** Stable name for this queue. Used in labels and as the table's accessible name. */
  readonly key: string
  readonly title: string
  readonly description?: string
  /** Singular noun for a row: "inquiry", "policy", "claim". */
  readonly noun: string

  readonly columns: readonly DataTableColumn<Row>[]
  readonly getRowId: (row: Row) => string

  readonly filters?: readonly QueueFilter[]
  /** Sort fields the repository declares. A URL naming another is ignored. */
  readonly sortable?: readonly string[]
  readonly defaultSort?: SortSpec
  readonly searchPlaceholder?: string

  /**
   * How much trouble a row is in, as the leading stripe expresses it. Severity
   * rather than status: a queue is read by how urgent its rows are, and the pill
   * in the row already says which state they are in.
   */
  readonly stripeMapping?: (row: Row) => Severity | undefined

  readonly bulkActions?: readonly QueueBulkAction<Row>[]

  /** The read. Receives exactly what the URL said, and nothing else. */
  readonly load: (query: ListQuery) => Promise<Page<Row>>

  /** What an empty queue teaches (U13). Never "No results". */
  readonly empty: {
    readonly title: string
    readonly explanation: string
  }

  readonly pageSize?: number
}

export type QueueConfig<Row extends RowData> = QueueBase<Row> & QueueRowTarget<Row>

/** Narrowing helper, so the component's JSX reads without casts. */
export function opensInDrawer<Row extends RowData>(
  config: QueueConfig<Row>,
): config is QueueBase<Row> & QueueRowsToDrawer<Row> {
  return config.rowTarget === 'drawer'
}
