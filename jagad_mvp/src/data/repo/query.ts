/**
 * The shape every list read takes — plan §7, "URL owns list state".
 *
 * A queue view has to be reconstructible from its URL, which means the query a
 * repository receives has to be expressible as search params and nothing else:
 * a text search, named filters with string values, one sort, one page. No
 * callbacks, no comparators, no opaque objects. If a screen cannot put it in the
 * address bar it does not belong in here.
 *
 * `filters` is deliberately `string[]` per key rather than a typed union. The
 * filter keys differ per queue and they come off the URL as strings; narrowing
 * them belongs to the feature that owns the queue, not to the transport.
 */

export const SORT_DIRECTIONS = ['asc', 'desc'] as const
export type SortDirection = (typeof SORT_DIRECTIONS)[number]

export type SortSpec = {
  readonly field: string
  readonly direction: SortDirection
}

export type ListQuery = {
  /** Free text. Each repository declares which fields it searches. */
  readonly search?: string
  /** Named filters, each holding the selected values. An empty array filters nothing. */
  readonly filters?: Readonly<Record<string, readonly string[]>>
  readonly sort?: SortSpec
  /** One-based, because it is read off a URL by a person. */
  readonly page?: number
  readonly pageSize?: number
}

export const DEFAULT_PAGE_SIZE = 25

/**
 * A page of rows plus the counts a pager needs. `total` is the size of the
 * filtered set, not of the table — a queue header that says "812 tasks" when the
 * filter shows four is the bug this field exists to prevent.
 */
export type Page<T> = {
  readonly rows: readonly T[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly pageCount: number
}

export function emptyPage<T>(pageSize: number = DEFAULT_PAGE_SIZE): Page<T> {
  return { rows: [], total: 0, page: 1, pageSize, pageCount: 0 }
}

/**
 * The read half every cluster shares. Mutations are never generic: each one
 * names the workflow move it performs, so a caller cannot patch a status field
 * behind a machine's back.
 */
export type ReadRepository<T> = {
  list(query?: ListQuery): Promise<Page<T>>
  get(id: string): Promise<T | null>
  getMany(ids: readonly string[]): Promise<readonly T[]>
}
