import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router'
import type { ReactNode } from 'react'
import type { RowData, RowSelectionState, SortingState } from '@tanstack/react-table'
import { useResource } from '../../lib/useResource'
import { Button } from '../../ui/Button'
import { DataTable, EmptyState, Pagination, SelectionBar, dataTableColumns } from '../../ui/data'
import type { DataTableColumn } from '../../ui/data'
import { Field, Input, Select } from '../../ui/form'
import { Drawer } from '../../ui/surface'
import { toneForSeverity } from '../../ui/tone'
import { ActionBar } from '../AppShell/ActionBar'
import { useDrawerSlot } from '../AppShell/drawer-slot'
import { PageHeader } from '../AppShell/PageHeader'
import { BulkActionGate } from './BulkActionGate'
import { opensInDrawer } from './queue-config'
import type { QueueConfig, QueueFilter, QueueSelection } from './queue-config'
import {
  assertQueueFilterKeys,
  isQueueNarrowed,
  queryFromQueueState,
  queueQueryKey,
  readQueueState,
  writeQueueState,
} from './queue-url'
import type { QueueUrlSchema, QueueUrlState } from './queue-url'
import styles from './WorkQueue.module.css'

/**
 * The "no choice made" option's text.
 *
 * Lowercasing the label wholesale turns a KYC filter into "All kyc", which is
 * the kind of small wrongness that makes a finished screen look unfinished. An
 * all-caps word is an acronym and is left alone; everything else is prose.
 */
function anyOptionLabel(filter: QueueFilter): string {
  if (filter.anyLabel) return filter.anyLabel
  const label = filter.label
    .split(' ')
    .map((word) => (word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(' ')
  return `All ${label}`
}

/** A queue's plural comes from its config; the fallback is only for regular nouns. */
function pluralOf(config: { noun: string; nounPlural?: string }): string {
  if (config.nounPlural) return config.nounPlural
  return /(?:s|x|z|ch|sh)$/i.test(config.noun) ? `${config.noun}es` : `${config.noun}s`
}

export type WorkQueueProps<Row extends RowData> = {
  config: QueueConfig<Row>
  /** Screen-level actions for the page header — "New inquiry", an export. */
  actions?: ReactNode
  /** Anything that belongs above the table: a notification rail, pinned stats. */
  children?: ReactNode
}

/**
 * The list pattern, built once (plan §6).
 *
 * Filter bar, dense table, severity stripe, bulk actions, row to drawer or row
 * to route. All fifteen queue screens in the plan are a `QueueConfig` handed to
 * this component, which is the largest single speed lever in the build — and,
 * more importantly, the reason the controls never move between modules.
 *
 * The URL owns filter, sort, page and selection. Every interaction below writes
 * search parameters and reads its state back out of them, so there is no second
 * copy to fall out of step: the back button works, a queue can be linked to, and
 * `<DataTable>` can keep TanStack's pagination and filtering unregistered
 * without losing anything.
 *
 * Two smaller rules, both learned from queues that get them wrong:
 *   - narrowing the list clears the selection, because "four selected" after a
 *     filter change means four rows nobody can see;
 *   - a page that has not arrived shows skeleton rows rather than an empty
 *     table, because an empty queue and a loading queue mean opposite things.
 */
/**
 * The trailing actions column.
 *
 * Built here rather than asked of each queue, so the header, the width and the
 * click containment are one implementation. The cell swallows its own clicks:
 * a queue whose rows navigate would otherwise open the record the moment
 * somebody pressed the button that removes it.
 */
function actionsColumn<Row extends RowData>(
  render: (row: Row) => ReactNode,
): DataTableColumn<Row> {
  const column = dataTableColumns<Row>()
  return column.display({
    id: 'row-actions',
    header: () => <span className={styles.actionsHead}>Actions</span>,
    cell: ({ row }) => (
      <div
        className={styles.rowActions}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        role="presentation"
      >
        {render(row.original)}
      </div>
    ),
  })
}

export function WorkQueue<Row extends RowData>({ config, actions, children }: WorkQueueProps<Row>) {
  const navigate = useNavigate()
  const drawerSlot = useDrawerSlot()
  const [params, setParams] = useSearchParams()

  // Declared after `page` so the action can re-read the list it just changed.

  const filters = config.filters ?? []
  const filterKeys = filters.map((filter) => filter.key)
  const [showAdvanced, setShowAdvanced] = useState(false)
  assertQueueFilterKeys(filterKeys)

  const schema: QueueUrlSchema = {
    filterKeys,
    sortable: config.sortable ?? [],
    defaultSort: config.defaultSort ?? null,
    ...(config.pageSize === undefined ? {} : { defaultPageSize: config.pageSize }),
  }

  const state = readQueueState(params, schema)
  const query = queryFromQueueState(state)

  const page = useResource(() => config.load(query), queueQueryKey(state))
  const rows = page.data?.rows ?? []
  const total = page.data?.total ?? 0

  function apply(next: Partial<QueueUrlState>, options?: { replace?: boolean }) {
    setParams(writeQueueState({ ...state, ...next }, schema), { replace: options?.replace ?? false })
  }

  /** Narrowing the list invalidates both the page number and the selection. */
  function narrow(next: Partial<QueueUrlState>, options?: { replace?: boolean }) {
    apply({ ...next, page: 1, selection: [], record: null }, options)
  }

  const sorting: SortingState = state.sort
    ? [{ id: state.sort.field, desc: state.sort.direction === 'desc' }]
    : []

  const rowSelection: RowSelectionState = Object.fromEntries(
    state.selection.map((id) => [id, true]),
  )

  const selectedRows = rows.filter((row) => state.selection.includes(config.getRowId(row)))
  const selection: QueueSelection<Row> = { ids: state.selection, rows: selectedRows }

  const openRecord =
    state.record === null
      ? null
      : (rows.find((row) => config.getRowId(row) === state.record) ?? null)

  const narrowed = isQueueNarrowed(state)

  /*
   * The filter bar, in two halves.
   *
   * `advanced` filters are folded away until asked for — but never while one of
   * them is active, because a list narrowed by a control the reader cannot see
   * is a list they cannot explain. `hasActiveAdvanced` is derived from the URL
   * rather than remembered, so arriving on a shared link with `stage=` already
   * set opens the panel on the first paint.
   */
  const advancedFilters = filters.filter((filter) => filter.advanced === true)
  const activeAdvanced = advancedFilters.filter(
    (filter) => (state.filters[filter.key]?.length ?? 0) > 0,
  ).length
  const advancedOpen = showAdvanced || activeAdvanced > 0
  const shownFilters = advancedOpen
    ? filters
    : filters.filter((filter) => filter.advanced !== true)

  const recordDrawer =
    opensInDrawer(config) && openRecord ? (
      <Drawer
        open
        onClose={() => apply({ record: null })}
        title={config.drawerTitle(openRecord)}
        subtitle={config.drawerSubtitle?.(openRecord)}
        defaultMaximised={config.drawerMaximised}
      >
        {config.renderDrawer(openRecord, {
          // A drawer that writes must be able to say so; `?record=` is not part
          // of the query key, so closing it alone would leave the stale row up.
          reload: () => page.reload(),
          close: () => apply({ record: null }),
        })}
      </Drawer>
    ) : null

  function openRow(row: Row) {
    if (config.rowTarget === 'route') {
      void navigate(config.rowHref(row))
      return
    }
    apply({ record: config.getRowId(row) })
  }

  return (
    <>
      <PageHeader
        title={config.title}
        meta={
          page.status === 'ready' ? (
            <span className={styles.total}>
              {total} {total === 1 ? config.noun : pluralOf(config)}
            </span>
          ) : null
        }
        actions={actions}
      />

      <ActionBar
        label={`${config.title} filters`}
        end={
          narrowed ? (
            <Button size="sm" icon="close" onClick={() => narrow({ search: '', filters: {} })}>
              Clear filters
            </Button>
          ) : null
        }
      >
        <Field label="Search" className={`${styles.control} ${styles.search}`}>
          <Input
            type="search"
            value={state.search}
            placeholder={config.searchPlaceholder ?? `Search ${pluralOf(config)}`}
            onChange={(event) => narrow({ search: event.target.value }, { replace: true })}
          />
        </Field>

        {/*
          * Advanced filters are folded away, and unfold themselves the moment one
          * of them is carrying a value — a filter that is narrowing the list is
          * never hidden from the person reading the list.
          */}
        {shownFilters.map((filter) => (
          <Field key={filter.key} label={filter.label} className={styles.control}>
            <Select
              value={state.filters[filter.key]?.[0] ?? ''}
              placeholder={anyOptionLabel(filter)}
              options={filter.options.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onChange={(event) => {
                const value = event.target.value
                narrow({
                  filters: value === '' ? omit(state.filters, filter.key) : { ...state.filters, [filter.key]: [value] },
                })
              }}
            />
          </Field>
        ))}

        {advancedFilters.length > 0 ? (
          <Button
            size="sm"
            aria-expanded={advancedOpen}
            onClick={() => setShowAdvanced(!advancedOpen)}
            // An active advanced filter pins the panel open: closing it would
            // hide a control that is changing what the list shows.
            disabled={activeAdvanced > 0}
          >
            {advancedOpen ? 'Fewer filters' : `More filters (${advancedFilters.length})`}
          </Button>
        ) : null}
      </ActionBar>

      <div className={styles.body}>
        {children}

        {config.bulkActions && config.bulkActions.length > 0 ? (
          <SelectionBar
            count={state.selection.length}
            total={total}
            noun={config.noun}
            onClear={() => apply({ selection: [] })}
          >
            {config.bulkActions.map((action) => (
              <BulkActionGate
                key={action.key}
                action={action}
                selection={selection}
                onDone={() => {
                  apply({ selection: [] })
                  page.reload()
                }}
              />
            ))}
          </SelectionBar>
        ) : null}

        <DataTable
          data={[...rows]}
          columns={
            config.rowActions
              ? [
                  ...config.columns,
                  actionsColumn<Row>((row) =>
                    config.rowActions?.(row, { reload: () => page.reload() }),
                  ),
                ]
              : config.columns
          }
          getRowId={config.getRowId}
          label={config.title}
          loading={page.isLoading}
          fill
          collapseConstantColumns
          selectable={Boolean(config.bulkActions && config.bulkActions.length > 0)}
          rowSelection={rowSelection}
          onRowSelectionChange={(next) =>
            apply({ selection: Object.keys(next).filter((id) => next[id]) })
          }
          sorting={sorting}
          onSortingChange={(next) => {
            const first = next[0]
            // Re-ordering changes which rows sit on this page, so the page number
            // resets; the selection is by id and survives.
            apply({
              sort: first ? { field: first.id, direction: first.desc ? 'desc' : 'asc' } : null,
              page: 1,
            })
          }}
          onOpenRow={openRow}
          rowTone={
            config.stripeMapping
              ? (row) => {
                  const severity = config.stripeMapping?.(row)
                  return severity ? toneForSeverity(severity) : undefined
                }
              : undefined
          }
          error={
            page.error ? (
              <EmptyState
                variant="error"
                title="This queue could not be loaded"
                explanation={page.error.message}
                action={
                  <Button variant="primary" size="sm" onClick={page.reload}>
                    Try again
                  </Button>
                }
              />
            ) : null
          }
          empty={
            narrowed ? (
              <EmptyState
                variant="filtered"
                title={`No ${config.noun} matches these filters`}
                explanation={`The queue is not empty — this view is narrowed. Clearing the filters shows everything you have access to.`}
                action={
                  <Button variant="primary" size="sm" onClick={() => narrow({ search: '', filters: {} })}>
                    Show everything
                  </Button>
                }
              />
            ) : (
              <EmptyState
                variant="empty"
                title={config.empty.title}
                explanation={config.empty.explanation}
              />
            )
          }
        />

        <Pagination
          pageIndex={state.page - 1}
          pageSize={state.pageSize}
          totalRows={total}
          noun={pluralOf(config)}
          onPageChange={(index) => apply({ page: index + 1, selection: [] })}
          onPageSizeChange={(size) => narrow({ pageSize: size })}
        />
      </div>

      {recordDrawer && drawerSlot ? createPortal(recordDrawer, drawerSlot) : recordDrawer}
    </>
  )
}

function omit(
  filters: Readonly<Record<string, readonly string[]>>,
  key: string,
): Record<string, readonly string[]> {
  const next: Record<string, readonly string[]> = {}
  for (const [name, values] of Object.entries(filters)) {
    if (name !== key) next[name] = values
  }
  return next
}
