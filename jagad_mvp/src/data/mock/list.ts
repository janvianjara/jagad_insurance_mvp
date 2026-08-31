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

import { isDiscarded } from '../../domain/amend'
import { DEFAULT_PAGE_SIZE } from '../repo/query'
import type { ListQuery, Page, SortSpec } from '../repo/query'

/**
 * The filter every queue has without declaring it — FR-20.2's soft discard.
 *
 * A discarded inquiry leaves its queue and stays in the book. That is one rule
 * about every list in the product, so it is applied here rather than in each of
 * the repositories that would otherwise each have to remember it — a queue that
 * forgot would show a duplicate lead somebody had already dealt with, and the
 * whole point of the discard is that it stops appearing.
 *
 * It is handled before `matchesFilters` and stripped from what that sees, so a
 * `ListSpec` never declares it and no existing spec had to change. The values are
 * the two a checkbox filter produces, so the state still round-trips through a
 * URL like every other filter: absent or `['false']` shows live rows only,
 * `['true']` shows discarded ones only, both together show everything.
 */
export const DISCARDED_FILTER_KEY = 'discarded'

const DISCARD_SELECTIONS = ['true', 'false'] as const

function passesDiscardFilter(row: unknown, selected: readonly string[]): boolean {
  for (const value of selected) {
    if (!(DISCARD_SELECTIONS as readonly string[]).includes(value)) {
      throw new Error(
        `Unknown "${DISCARDED_FILTER_KEY}" filter value "${value}". It takes "true", "false" or both.`,
      )
    }
  }

  const discarded = isDiscarded(row)
  // The default, and the one that matters: nothing selected hides discarded rows.
  if (selected.length === 0) return !discarded
  return selected.includes(discarded ? 'true' : 'false')
}

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
  const supplied = query.filters ?? {}
  const discardSelection = supplied[DISCARDED_FILTER_KEY] ?? []
  const filters = Object.fromEntries(
    Object.entries(supplied).filter(([key]) => key !== DISCARDED_FILTER_KEY),
  )

  let matched = rows.filter(
    (row) =>
      passesDiscardFilter(row, discardSelection) &&
      (needle === '' || matchesSearch(row, spec, needle)) &&
      matchesFilters(row, spec, filters),
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
