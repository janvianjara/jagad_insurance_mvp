/**
 * The queue URL codec — plan §7, "URL owns list state", and the constitution's
 * "any queue view is reconstructible from its URL".
 *
 * This is the whole of that promise, in pure functions with no React in them.
 * A queue's state is read out of `URLSearchParams` and written back into them;
 * nothing about which rows are shown, in what order, on which page, with what
 * ticked, is held anywhere else. Copy the address bar and a colleague sees the
 * same screen — which is what makes an escalation notice able to point at a
 * queue rather than at a module.
 *
 * `<DataTable>` deliberately leaves TanStack's pagination and filtering features
 * unregistered (see `src/ui/data/table-setup.ts`). That decision holds, and this
 * file is why: registering them would give the table a second, private copy of
 * page and filter state, and the first time the two disagreed the URL would stop
 * being the truth. The table sorts and selects; the URL decides what it is
 * looking at.
 *
 * Encoding, chosen to read the way §4 already writes it
 * (`/inquiries?status=&filter=&owner=&page=`):
 *
 *   q        free text search
 *   sort     `field:asc` or `field:desc`
 *   page     one-based, because a person reads it
 *   size     page size
 *   sel      comma-separated ids of the ticked rows
 *   record   the row whose drawer is open
 *   <key>    every declared filter, under its own name, values comma-separated
 *
 * Filter keys therefore share a namespace with the six reserved names above, and
 * `assertQueueFilterKeys` refuses a configuration that collides rather than
 * letting one silently shadow the other.
 */

import { DEFAULT_PAGE_SIZE } from '../../data/repo'
import type { ListQuery, SortDirection, SortSpec } from '../../data/repo'

export const QUEUE_PARAMS = {
  search: 'q',
  sort: 'sort',
  page: 'page',
  pageSize: 'size',
  selection: 'sel',
  record: 'record',
} as const

export type QueueParam = (typeof QUEUE_PARAMS)[keyof typeof QUEUE_PARAMS]

export const RESERVED_QUEUE_PARAMS: readonly string[] = Object.values(QUEUE_PARAMS)

export type QueueUrlState = {
  readonly search: string
  readonly filters: Readonly<Record<string, readonly string[]>>
  readonly sort: SortSpec | null
  /** One-based. */
  readonly page: number
  readonly pageSize: number
  readonly selection: readonly string[]
  /** The row whose detail drawer is open, or null. */
  readonly record: string | null
}

export type QueueUrlSchema = {
  /** Filter keys the repository declares. Anything else in the URL is ignored. */
  readonly filterKeys: readonly string[]
  /** Sort fields the repository declares. A URL naming another is ignored. */
  readonly sortable: readonly string[]
  readonly defaultSort?: SortSpec | null
  readonly defaultPageSize?: number
}

/**
 * Refuses a queue whose filter key would shadow a reserved parameter. Thrown at
 * first render rather than warned about, because the failure it prevents — a
 * filter that quietly does nothing, or a page number read as a status — is
 * invisible until someone reconciles a count by hand.
 */
export function assertQueueFilterKeys(filterKeys: readonly string[]): void {
  const clash = filterKeys.filter((key) => RESERVED_QUEUE_PARAMS.includes(key))
  if (clash.length > 0) {
    throw new Error(
      `Queue filter ${clash.map((key) => `"${key}"`).join(', ')} collides with a reserved URL parameter (${RESERVED_QUEUE_PARAMS.join(', ')}). Rename the filter.`,
    )
  }
}

function splitList(raw: string | null): readonly string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

function parseSort(raw: string | null, sortable: readonly string[]): SortSpec | null {
  if (!raw) return null
  const [field, direction] = raw.split(':')
  if (!field || !sortable.includes(field)) return null
  const resolved: SortDirection = direction === 'desc' ? 'desc' : 'asc'
  return { field, direction: resolved }
}

function parsePositive(raw: string | null, fallback: number): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 1) return fallback
  return Math.floor(value)
}

/** Reads a queue's whole state out of the address bar. */
export function readQueueState(
  params: URLSearchParams,
  schema: QueueUrlSchema,
): QueueUrlState {
  const filters: Record<string, readonly string[]> = {}
  for (const key of schema.filterKeys) {
    const values = splitList(params.get(key))
    if (values.length > 0) filters[key] = values
  }

  return {
    search: params.get(QUEUE_PARAMS.search) ?? '',
    filters,
    sort: parseSort(params.get(QUEUE_PARAMS.sort), schema.sortable) ?? schema.defaultSort ?? null,
    page: parsePositive(params.get(QUEUE_PARAMS.page), 1),
    pageSize: parsePositive(params.get(QUEUE_PARAMS.pageSize), schema.defaultPageSize ?? DEFAULT_PAGE_SIZE),
    selection: splitList(params.get(QUEUE_PARAMS.selection)),
    record: params.get(QUEUE_PARAMS.record),
  }
}

/**
 * Writes it back. Defaults are omitted rather than spelled out, so an untouched
 * queue has a clean URL and every parameter present in one is a choice somebody
 * actually made.
 */
export function writeQueueState(state: QueueUrlState, schema: QueueUrlSchema): URLSearchParams {
  const params = new URLSearchParams()

  if (state.search.trim() !== '') params.set(QUEUE_PARAMS.search, state.search.trim())

  for (const key of schema.filterKeys) {
    const values = state.filters[key] ?? []
    if (values.length > 0) params.set(key, values.join(','))
  }

  const defaultSort = schema.defaultSort ?? null
  if (
    state.sort &&
    (!defaultSort ||
      state.sort.field !== defaultSort.field ||
      state.sort.direction !== defaultSort.direction)
  ) {
    params.set(QUEUE_PARAMS.sort, `${state.sort.field}:${state.sort.direction}`)
  }

  if (state.page > 1) params.set(QUEUE_PARAMS.page, String(state.page))
  if (state.pageSize !== (schema.defaultPageSize ?? DEFAULT_PAGE_SIZE)) {
    params.set(QUEUE_PARAMS.pageSize, String(state.pageSize))
  }
  if (state.selection.length > 0) params.set(QUEUE_PARAMS.selection, state.selection.join(','))
  if (state.record) params.set(QUEUE_PARAMS.record, state.record)

  return params
}

/** The half of the state a repository is allowed to see. */
export function queryFromQueueState(state: QueueUrlState): ListQuery {
  const query: ListQuery = {
    filters: state.filters,
    page: state.page,
    pageSize: state.pageSize,
    ...(state.search.trim() === '' ? {} : { search: state.search.trim() }),
    ...(state.sort ? { sort: state.sort } : {}),
  }
  return query
}

/**
 * The identity of a *read*. Selection and the open record change the screen but
 * not the rows, so they are excluded: ticking a checkbox must not re-fetch the
 * page.
 */
export function queueQueryKey(state: QueueUrlState): string {
  return JSON.stringify(queryFromQueueState(state))
}

/** Whether anything is narrowing the list — decides which empty state is honest. */
export function isQueueNarrowed(state: QueueUrlState): boolean {
  if (state.search.trim() !== '') return true
  return Object.values(state.filters).some((values) => values.length > 0)
}
