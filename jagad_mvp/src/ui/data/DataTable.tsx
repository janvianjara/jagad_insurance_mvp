import { useRef, useState } from 'react'
import { useTable } from '@tanstack/react-table'
import type {
  ColumnVisibilityState,
  RowData,
  RowSelectionState,
  SortingState,
  Updater,
} from '@tanstack/react-table'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import type { Tone } from '../tone'
import { Skeleton } from './Skeleton'
import { SortHeader } from './SortHeader'
import { dataTableFeatures } from './table-setup'
import type { DataTableColumn } from './table-setup'
import styles from './DataTable.module.css'

function resolve<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(previous) : updater
}

const EMPTY_SELECTION: RowSelectionState = {}
const EMPTY_SORTING: SortingState = []
const EMPTY_VISIBILITY: ColumnVisibilityState = {}

/**
 * Below this, "every value is the same" is not evidence of anything — a page of
 * one row makes every column constant, and two rows agreeing is a coincidence.
 */
const CONSTANT_MIN_ROWS = 3

/** What must survive the collapse, so a table never folds down to one column. */
const CONSTANT_MIN_KEPT = 2

/**
 * A value safe to compare for the constant-column rule.
 *
 * Deliberately primitives only. An accessor returning an object or an array is
 * compared by identity, and two rows holding equal-but-distinct objects would
 * read as varying while two rows sharing one frozen object would read as
 * constant — neither answer is about the data. A column like that keeps its
 * place, which is the conservative direction.
 */
function comparableValue(value: unknown): string | null {
  if (value === null) return 'null'
  // NOT comparable. A display column — row actions, a checkbox, anything drawn
  // rather than read — has no accessor, so `getValue` answers `undefined` for
  // every row. Treating that as a value made "no data here" look like the most
  // constant column on the page, and the first thing the rule folded away was
  // the Discard button.
  if (value === undefined) return null
  const kind = typeof value
  if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'bigint') {
    return `${kind}:${String(value)}`
  }
  return null
}

export type DataTableProps<TData extends RowData> = {
  /** Rows for the page being shown. Keep the array reference stable between renders. */
  data: TData[]
  columns: ReadonlyArray<DataTableColumn<TData>>
  /**
   * Stable identity per row. Selection is stored by id, so an index-based id
   * would silently re-point the selection when the sort order changes.
   */
  getRowId: (row: TData) => string
  /** Accessible name for the grid. */
  label: string

  /** Loading, empty and error are the three states every list surface owes a person. */
  loading?: boolean
  loadingRows?: number
  empty?: ReactNode
  error?: ReactNode

  selectable?: boolean
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (selection: RowSelectionState) => void

  sorting?: SortingState
  onSortingChange?: (sorting: SortingState) => void

  columnVisibility?: ColumnVisibilityState
  onColumnVisibilityChange?: (visibility: ColumnVisibilityState) => void

  /** Opening a row — click, or Enter on the focused row. */
  onOpenRow?: (row: TData) => void
  /** Severity stripe down the leading edge of a row, U7 colours. */
  rowTone?: (row: TData) => Tone | undefined
  stickyHeader?: boolean
  /**
   * Stretch the frame to the height its parent has left instead of ending at
   * the last row. A queue holding three rows then has the same shape as one
   * holding thirty.
   */
  fill?: boolean
  /**
   * Fold away any column holding the same value in every row on this page, and
   * state those values once in the table's caption instead.
   *
   * A column whose cells all read `Unpaid` costs a full column of width and
   * returns no bits: it cannot order the page, cannot distinguish two rows, and
   * cannot be scanned for an exception, because there isn't one. Four of the
   * eight columns on the policy queue were in that state, which is most of why
   * every remaining cell wrapped to two lines.
   *
   * The fact is not discarded — it moves to the caption, where it is said once
   * rather than twenty-five times. That is the whole trade: the reader loses
   * nothing they could have used and gets the width back.
   */
  collapseConstantColumns?: boolean
}

/**
 * The dense queue table every list screen is built from.
 *
 * Generic over its row type and deliberately ignorant of the domain: it knows
 * about columns, selection, sort order and keyboard focus, and nothing about
 * policies, claims or money. Anything domain-shaped belongs in the column
 * definitions the caller hands in.
 *
 * Keyboard model: one tab stop for the whole grid, then arrow keys move the
 * focused row, Home and End jump to the ends, Enter opens the focused row and
 * Space ticks it. Someone working a queue all day never has to reach for the
 * mouse.
 */
export function DataTable<TData extends RowData>({
  data,
  columns,
  getRowId,
  label,
  loading,
  loadingRows = 8,
  empty,
  error,
  selectable,
  rowSelection,
  onRowSelectionChange,
  sorting,
  onSortingChange,
  columnVisibility,
  onColumnVisibilityChange,
  onOpenRow,
  rowTone,
  stickyHeader = true,
  fill,
  collapseConstantColumns,
}: DataTableProps<TData>) {
  const [ownSelection, setOwnSelection] = useState<RowSelectionState>(EMPTY_SELECTION)
  const [ownSorting, setOwnSorting] = useState<SortingState>(EMPTY_SORTING)
  const [ownVisibility, setOwnVisibility] = useState<ColumnVisibilityState>(EMPTY_VISIBILITY)
  const [focusedRow, setFocusedRow] = useState(0)
  const bodyRef = useRef<HTMLTableSectionElement>(null)

  const selectionState = rowSelection ?? ownSelection
  const sortingState = sorting ?? ownSorting
  const visibilityState = columnVisibility ?? ownVisibility

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    getRowId,
    enableRowSelection: selectable ?? false,
    state: {
      rowSelection: selectionState,
      sorting: sortingState,
      columnVisibility: visibilityState,
    },
    onRowSelectionChange: (updater) => {
      const next = resolve(updater, selectionState)
      setOwnSelection(next)
      onRowSelectionChange?.(next)
    },
    onSortingChange: (updater) => {
      const next = resolve(updater, sortingState)
      setOwnSorting(next)
      onSortingChange?.(next)
    },
    onColumnVisibilityChange: (updater) => {
      const next = resolve(updater, visibilityState)
      setOwnVisibility(next)
      onColumnVisibilityChange?.(next)
    },
  })

  const rows = table.getRowModel().rows

  /*
   * Which columns say the same thing in every row on this page.
   *
   * Read off the table rather than off `data` so it is the CELL value that is
   * compared — the one the reader is actually looking at — and so a column with
   * no accessor is skipped for free instead of being special-cased.
   */
  const constantColumnIds = new Set<string>()
  if (collapseConstantColumns && !loading && !error && rows.length >= CONSTANT_MIN_ROWS) {
    for (const column of table.getVisibleLeafColumns()) {
      // Belt and braces with the `undefined` rule above: a column that reads
      // nothing off the row is not a column about the data.
      if (column.accessorFn === undefined) continue
      // Some columns are constant BECAUSE that is what they have to report.
      if (column.columnDef.meta?.alwaysShow === true) continue
      const first = comparableValue(rows[0].getValue(column.id))
      if (first === null) continue
      if (rows.every((row) => comparableValue(row.getValue(column.id)) === first)) {
        constantColumnIds.add(column.id)
      }
    }
    // Folding a table down to its last column or two is not a simplification.
    while (
      constantColumnIds.size > 0 &&
      table.getVisibleLeafColumns().length - constantColumnIds.size < CONSTANT_MIN_KEPT
    ) {
      const last = [...constantColumnIds].pop()
      if (last === undefined) break
      constantColumnIds.delete(last)
    }
  }

  /** The folded columns, with the one value each of them holds, ready to render. */
  const constantFacts =
    constantColumnIds.size > 0
      ? table
          .getHeaderGroups()
          .flatMap((group) => group.headers)
          .filter((header) => constantColumnIds.has(header.column.id))
          .map((header) => ({
            id: header.column.id,
            header,
            cell: rows[0].getVisibleCells().find((cell) => cell.column.id === header.column.id),
          }))
          .filter((fact) => fact.cell !== undefined)
      : []

  const shown = (columnId: string) => !constantColumnIds.has(columnId)
  const leadingColumns = (selectable ? 1 : 0) + (rowTone ? 1 : 0)
  const spanAll =
    table.getVisibleLeafColumns().length - constantColumnIds.size + leadingColumns

  function focusRowAt(index: number) {
    const target = bodyRef.current?.querySelectorAll<HTMLTableRowElement>('tr[data-row-id]')[index]
    target?.focus()
  }

  function onBodyKeyDown(event: ReactKeyboardEvent<HTMLTableSectionElement>) {
    if (rows.length === 0) return
    const clamped = Math.min(focusedRow, rows.length - 1)

    if (event.key === 'Enter') {
      event.preventDefault()
      if (onOpenRow) onOpenRow(rows[clamped].original)
      return
    }
    if (event.key === ' ' && selectable) {
      event.preventDefault()
      rows[clamped].toggleSelected()
      return
    }

    let next: number | null = null
    if (event.key === 'ArrowDown') next = Math.min(clamped + 1, rows.length - 1)
    else if (event.key === 'ArrowUp') next = Math.max(clamped - 1, 0)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = rows.length - 1
    if (next === null) return

    event.preventDefault()
    setFocusedRow(next)
    focusRowAt(next)
  }

  const showRows = !loading && !error && rows.length > 0
  const showEmpty = !loading && !error && rows.length === 0

  return (
    <div className={styles.wrap} data-fill={fill ? 'true' : undefined}>
      <table
        role="grid"
        aria-label={label}
        aria-busy={loading ? true : undefined}
        aria-multiselectable={selectable ? true : undefined}
        className={[styles.table, stickyHeader ? styles.sticky : null].filter(Boolean).join(' ')}
      >
        {constantFacts.length > 0 ? (
          <caption className={styles.caption}>
            <div className={styles.captionInner}>
              <span className={styles.captionLead}>Every row:</span>
              {constantFacts.map((fact) => (
                <span key={fact.id} className={styles.captionFact}>
                  <span className={styles.captionLabel}>
                    <table.FlexRender header={fact.header} />
                  </span>
                  {fact.cell ? <table.FlexRender cell={fact.cell} /> : null}
                </span>
              ))}
            </div>
          </caption>
        ) : null}

        <thead className={styles.head}>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {rowTone ? (
                <th role="columnheader" className={styles.stripeCell} aria-label="Status" />
              ) : null}
              {selectable ? (
                <th role="columnheader" className={styles.selectCell}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    aria-label="Select all rows"
                    checked={table.getIsAllRowsSelected()}
                    ref={(node) => {
                      if (node) {
                        node.indeterminate =
                          !table.getIsAllRowsSelected() && table.getIsSomeRowsSelected()
                      }
                    }}
                    onChange={table.getToggleAllRowsSelectedHandler()}
                  />
                </th>
              ) : null}
              {group.headers.filter((header) => shown(header.column.id)).map((header) => {
                const sorted = header.column.getIsSorted()
                const canSort = header.column.getCanSort()
                const toggle = header.column.getToggleSortingHandler()
                return (
                  <th
                    key={header.id}
                    role="columnheader"
                    colSpan={header.colSpan}
                    scope="col"
                    className={styles.th}
                    aria-sort={
                      !canSort || sorted === false
                        ? undefined
                        : sorted === 'asc'
                          ? 'ascending'
                          : 'descending'
                    }
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <SortHeader
                        sorted={sorted}
                        sortIndex={sortingState.length > 1 ? header.column.getSortIndex() + 1 : 0}
                        onToggle={(event) => toggle?.(event)}
                      >
                        <table.FlexRender header={header} />
                      </SortHeader>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>

        <tbody ref={bodyRef} onKeyDown={onBodyKeyDown}>
          {loading
            ? Array.from({ length: loadingRows }, (_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} className={styles.row}>
                  {Array.from({ length: spanAll }, (_, cellIndex) => (
                    <td key={cellIndex} role="gridcell" className={styles.td}>
                      <Skeleton width={cellIndex % 3 === 0 ? '60%' : '85%'} />
                    </td>
                  ))}
                </tr>
              ))
            : null}

          {error ? (
            <tr>
              <td role="gridcell" colSpan={spanAll} className={styles.stateCell}>
                {error}
              </td>
            </tr>
          ) : null}

          {showEmpty ? (
            <tr>
              <td role="gridcell" colSpan={spanAll} className={styles.stateCell}>
                {empty}
              </td>
            </tr>
          ) : null}

          {showRows
            ? rows.map((row, index) => {
                const tone = rowTone?.(row.original)
                const selected = row.getIsSelected()
                return (
                  <tr
                    key={row.id}
                    data-row-id={row.id}
                    aria-selected={selectable ? selected : undefined}
                    data-selected={selected ? 'true' : undefined}
                    tabIndex={index === Math.min(focusedRow, rows.length - 1) ? 0 : -1}
                    className={[styles.row, onOpenRow ? styles.openable : null]
                      .filter(Boolean)
                      .join(' ')}
                    onFocus={() => setFocusedRow(index)}
                    onClick={() => onOpenRow?.(row.original)}
                  >
                    {rowTone ? (
                      <td role="gridcell" className={styles.stripeCell} data-tone={tone}>
                        <span className={styles.srOnly}>{tone ?? 'no status'}</span>
                      </td>
                    ) : null}
                    {selectable ? (
                      <td
                        role="gridcell"
                        className={styles.selectCell}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          aria-label={`Select row ${row.id}`}
                          checked={selected}
                          disabled={!row.getCanSelect()}
                          onChange={row.getToggleSelectedHandler()}
                        />
                      </td>
                    ) : null}
                    {row
                      .getVisibleCells()
                      .filter((cell) => shown(cell.column.id))
                      .map((cell) => (
                        <td key={cell.id} role="gridcell" className={styles.td}>
                          <table.FlexRender cell={cell} />
                        </td>
                      ))}
                  </tr>
                )
              })
            : null}
        </tbody>
      </table>
    </div>
  )
}
