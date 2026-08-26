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
  const leadingColumns = (selectable ? 1 : 0) + (rowTone ? 1 : 0)
  const spanAll = table.getVisibleLeafColumns().length + leadingColumns

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
    <div className={styles.wrap}>
      <table
        role="grid"
        aria-label={label}
        aria-busy={loading ? true : undefined}
        aria-multiselectable={selectable ? true : undefined}
        className={[styles.table, stickyHeader ? styles.sticky : null].filter(Boolean).join(' ')}
      >
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
              {group.headers.map((header) => {
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
                    {row.getVisibleCells().map((cell) => (
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
