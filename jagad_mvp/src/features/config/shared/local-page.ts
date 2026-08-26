/**
 * A `ListQuery` run over rows already in hand.
 *
 * Configuration is a handful of rows an admin edits in place, so the MVP's
 * config repository serves whole lists rather than pages. `<WorkQueue>` still
 * asks for a `Page`, and it must keep asking: the queue's promise is that filter,
 * sort and page came off the URL, and a config screen that answered a different
 * shape would be a config screen with its own list state.
 *
 * So this is the same contract the mock adapter's list engine honours — declared
 * search fields, declared filters, declared sorts — applied to the working set
 * the config store holds. An undeclared filter throws rather than returning
 * everything, for the same reason it does in the data layer: a filter that
 * quietly does nothing is a count nobody can reconcile.
 */

import { DEFAULT_PAGE_SIZE } from '../../../data/repo'
import type { ListQuery, Page } from '../../../data/repo'

export type LocalCell = string | number | boolean | null | undefined

export type LocalListSpec<T> = {
  readonly search?: readonly ((row: T) => LocalCell)[]
  readonly filters?: Readonly<Record<string, (row: T) => LocalCell>>
  readonly sorts?: Readonly<Record<string, (row: T) => LocalCell>>
}

function asText(value: LocalCell): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function compare(a: LocalCell, b: LocalCell): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return asText(a).localeCompare(asText(b))
}

export function localPage<T>(
  rows: readonly T[],
  spec: LocalListSpec<T>,
  query: ListQuery = {},
): Page<T> {
  const needle = (query.search ?? '').trim().toLowerCase()
  const filters = query.filters ?? {}

  let matched = rows.filter((row) => {
    if (needle !== '') {
      const readers = spec.search ?? []
      const hit = readers.some((read) => asText(read(row)).toLowerCase().includes(needle))
      if (!hit) return false
    }

    for (const [key, selected] of Object.entries(filters)) {
      if (selected.length === 0) continue
      const read = spec.filters?.[key]
      if (!read) {
        throw new Error(
          `Unknown filter "${key}". A configuration queue declares the filters it supports; an undeclared one would silently return every row.`,
        )
      }
      if (!selected.includes(asText(read(row)))) return false
    }

    return true
  })

  const sort = query.sort
  if (sort) {
    const read = spec.sorts?.[sort.field]
    if (read) {
      const direction = sort.direction === 'desc' ? -1 : 1
      matched = [...matched].sort((a, b) => compare(read(a), read(b)) * direction)
    }
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
