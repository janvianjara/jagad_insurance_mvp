/**
 * The fixture clock.
 *
 * Every date in the fixture set is written relative to one anchor rather than to
 * `new Date()`. Two reasons, and both bite in practice: a fixture built from the
 * wall clock produces a different set on every run, which breaks the determinism
 * test; and the story cast's dates are load-bearing — Jayesh Kapadia's grace
 * window closes on 8 September, Nilesh Bhatt renews on 30 August — so they have
 * to stay put while the demo is walked.
 *
 * The anchor is the date the story cast was written against. A caller that wants
 * the set to move with the calendar passes its own `now`.
 */

export const FIXTURE_NOW = new Date('2026-08-26T09:30:00.000Z')

const MS_PER_DAY = 86_400_000

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function isoTime(value: Date): string {
  return value.toISOString()
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY)
}

export function addMinutes(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * 60_000)
}

export function addMonths(from: Date, months: number): Date {
  const moved = new Date(from.getTime())
  moved.setUTCMonth(moved.getUTCMonth() + months)
  return moved
}

export function addYears(from: Date, years: number): Date {
  const moved = new Date(from.getTime())
  moved.setUTCFullYear(moved.getUTCFullYear() + years)
  return moved
}

/** Days between two dates, as a whole number. Negative when `to` is earlier. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)
}
