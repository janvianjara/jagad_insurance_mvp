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
  /**
   * Keep this one folded away until somebody asks for it.
   *
   * The inquiry queue declared seven controls across the top of the screen and
   * the policy queue six, which is more chrome than most of those screens have
   * rows above the fold — and on any given day a person narrows by one or two of
   * them. Marking the rest `advanced` puts them a click away instead of in the
   * way.
   *
   * It changes NOTHING about the URL: an advanced filter reads and writes the
   * same search parameter it always did, so a linked view restores exactly, and
   * `<WorkQueue>` opens the panel by itself whenever one of them is carrying a
   * value. A filter that is doing something is never hidden.
   */
  readonly advanced?: boolean
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
 * One decision the person makes before confirming — which assignee, which
 * template, which reason.
 *
 * It sits inside the gate rather than beside the action button so the preview
 * below it answers for the choice that was actually made. The empty value is a
 * real option with a label of its own, not an absence: "leave it to routing" is
 * an answer, and the preview says what that will do.
 */
export type QueueBulkChoice = {
  readonly key: string
  readonly label: string
  readonly options: readonly QueueFilterOption[]
  /** What the empty value means, spelled out. Omit and the choice is required. */
  readonly emptyLabel?: string
  readonly hint?: ReactNode
}

/**
 * A bulk action. Every one of these is an outward mutation, so the shape forces
 * a `<ConfirmGate>` preview: `preview` is not optional, and `run` is only ever
 * reached from Confirm.
 *
 * `choice` is what the person picked in the gate, empty string when they picked
 * nothing or the action offers no choice. `preview` reads it as well as `run`, so
 * changing the choice redraws the preview rather than leaving it describing a
 * decision that is no longer the one on screen.
 */
export type QueueBulkAction<Row extends RowData> = {
  readonly key: string
  readonly label: string
  readonly icon?: IconName
  readonly variant?: ButtonVariant
  /** Offered inside the gate, above the preview. */
  readonly choice?: QueueBulkChoice
  readonly confirmTitle: (selection: QueueSelection<Row>, choice: string) => string
  /** The key/value preview of what will change. An empty list disables Confirm. */
  readonly preview: (selection: QueueSelection<Row>, choice: string) => readonly ConfirmChange[]
  /** Who gets told, what cannot be undone. */
  readonly note?: (selection: QueueSelection<Row>, choice: string) => ReactNode
  readonly confirmLabel?: string
  readonly run: (selection: QueueSelection<Row>, choice: string) => Promise<QueueActionOutcome>
}

/**
 * What a drawer may ask of the queue behind it.
 *
 * A drawer that writes has a problem no other part of this component has: the
 * URL owns list state, but `?record=` is not part of the `ListQuery`, so closing
 * the drawer does not re-read the page. A verified collection would sit there in
 * a queue of unverified ones until something else happened to change the URL.
 *
 * So a mutating drawer is handed the two moves it needs and nothing else. It
 * cannot filter, sort, page or select — those belong to the person, through the
 * URL — and it is given no access to the rows.
 */
/** What a row action may do to the list it sits in. */
export type QueueRowControls = {
  /** Re-read the current page. Call after a write that removes or changes the row. */
  readonly reload: () => void
}

export type QueueDrawerControls = {
  /** Re-read the current page. Call after a write that changes what a row is. */
  readonly reload: () => void
  /** Close the drawer, as the dismiss control does. */
  readonly close: () => void
}

type QueueRowsToDrawer<Row extends RowData> = {
  /** The row's detail opens in the shell's right drawer, addressed by `?record=`. */
  readonly rowTarget: 'drawer'
  readonly drawerTitle: (row: Row) => string
  readonly drawerSubtitle?: (row: Row) => string | undefined
  /**
   * Opens the drawer full-bleed. For the queues whose "record" is a workspace
   * rather than a document — the schema builder is three columns and a live
   * preview, and 440px is not a width you can configure a form in.
   */
  readonly drawerMaximised?: boolean
  /**
   * `queue` is ignored by every read-only drawer, which is why it is a second
   * parameter rather than a required one: a `(row) => ReactNode` stays assignable.
   */
  readonly renderDrawer: (row: Row, queue: QueueDrawerControls) => ReactNode
}

type QueueRowsToRoute<Row extends RowData> = {
  /** The row's detail is a screen of its own. */
  readonly rowTarget: 'route'
  readonly rowHref: (row: Row) => string
}

export type QueueRowTarget<Row extends RowData> = QueueRowsToDrawer<Row> | QueueRowsToRoute<Row>

type QueueBase<Row extends RowData> = {
  /**
   * Per-row actions, rendered in a trailing column.
   *
   * Deliberately narrow. A queue's job is to show what needs a person and hand
   * them to the record, so anything that opens a form or asks a question belongs
   * on the record. What earns a place here is the act that removes a row from
   * the very list you are looking at: making somebody open a record to discard
   * it means opening one record per duplicate, and the whole reason the row is
   * in front of them is that it should not be.
   *
   * The cell stops its own clicks, so pressing a row action never also follows
   * the row to its record.
   */
  readonly rowActions?: (row: Row, queue: QueueRowControls) => ReactNode
  /** Stable name for this queue. Used in labels and as the table's accessible name. */
  readonly key: string
  readonly title: string
  /** Singular noun for a row: "inquiry", "policy", "claim". */
  readonly noun: string
  /**
   * The plural, stated rather than derived. Appending "s" produced "inquirys"
   * and "policys" on screen; English plurals are not a string operation and a
   * queue knows its own noun.
   */
  readonly nounPlural?: string

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
