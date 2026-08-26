/**
 * Date shapes shared by the type primitives.
 *
 * Its own module because a file that exports a component may not also export
 * constants and helpers (fast refresh, lint-enforced).
 */
import { isValid } from 'date-fns'

export const DATE_FORMATS = {
  date: 'dd MMM yyyy',
  datetime: 'dd MMM yyyy, HH:mm',
  time: 'HH:mm',
  /** Compact form for dense queue columns. */
  short: 'dd/MM/yy',
  month: 'MMM yyyy',
} as const

export type DateTimeMode = keyof typeof DATE_FORMATS

/** Accepts what the repositories carry — a Date, an ISO string or epoch millis. */
export function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value)
}

/** Null, undefined and unparseable all mean the same thing to a reader: absent. */
export function readDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  const date = toDate(value)
  return isValid(date) ? date : null
}
