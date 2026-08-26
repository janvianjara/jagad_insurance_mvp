/**
 * The list engine — plan §7, "URL owns list state".
 *
 * Every queue in this product asks the same four questions of its rows: does the
 * search text match, do the selected filters hold, in what order, and which page.
 * Answering that once means every queue behaves identically, and it means the
 * answer is expressed against a `ListQuery` that came off a URL — no comparators
 * crossing the repository boundary, nothing a screen can pass that an HTTP API
 * could not carry later.
 *
 * A repository declares which fields are searchable, filterable and sortable by
 * name. Anything not declared is refused rather than silently ignored: a filter
 * that quietly does nothing is how a queue ends up showing a number nobody can
 * reconcile.
 */

import { DEFAULT_PAGE_SIZE } from '../repo/query'
import type { ListQuery, Page, SortSpec } from '../repo/query'

export type Cell = string | number | boolean | null | undefined
export type FieldReader<T> = (row: T) => Cell

export type ListSpec<T> = {
  /** Fields the free-text search looks at, case-insensitively. */
  readonly search?: readonly FieldReader<T>[]
  /** Filter key to the field it tests. A row passes when its value is in the selection. */
  readonly filters?: Readonly<Record<string, FieldReader<T>>>
  readonly sorts?: Readonly<Record<string, FieldReader<T>>>
  readonly defaultSort?: SortSpec
}

function asText(value: Cell): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function compare(a: Cell, b: Cell): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return asText(a).localeCompare(asText(b))
}

function matchesSearch<T>(row: T, spec: ListSpec<T>, needle: string): boolean {
  const readers = spec.search ?? []
  if (readers.length === 0) return true
  return readers.some((read) => asText(read(row)).toLowerCase().includes(needle))
}

function matchesFilters<T>(
  row: T,
  spec: ListSpec<T>,
  filters: Readonly<Record<string, readonly string[]>>,
): boolean {
  for (const [key, selected] of Object.entries(filters)) {
    if (selected.length === 0) continue

    const read = spec.filters?.[key]
    if (!read) {
      throw new Error(
        `Unknown filter "${key}". A repository declares the filters it supports; an undeclared one would silently return every row.`,
      )
    }
    if (!selected.includes(asText(read(row)))) return false
  }
  return true
}

/** Runs a URL-shaped query over rows already in memory. */
export function runQuery<T>(
  rows: readonly T[],
  spec: ListSpec<T>,
  query: ListQuery = {},
): Page<T> {
  const needle = (query.search ?? '').trim().toLowerCase()
  const filters = query.filters ?? {}

  let matched = rows.filter(
    (row) => (needle === '' || matchesSearch(row, spec, needle)) && matchesFilters(row, spec, filters),
  )

  const sort = query.sort ?? spec.defaultSort
  if (sort) {
    const read = spec.sorts?.[sort.field]
    if (!read) {
      throw new Error(
        `Unknown sort field "${sort.field}". A repository declares the columns it can sort by.`,
      )
    }
    const direction = sort.direction === 'desc' ? -1 : 1
    matched = [...matched].sort((a, b) => compare(read(a), read(b)) * direction)
  }

  const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE)
  const pageCount = Math.ceil(matched.length / pageSize)
  const page = Math.min(Math.max(1, query.page ?? 1), Math.max(1, pageCount))
  const start = (page - 1) * pageSize

  return {
    rows: matched.slice(start, start + pageSize),
    total: matched.length,
    page,
    pageSize,
    pageCount,
  }
}
