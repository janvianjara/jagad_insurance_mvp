/**
 * The clock the reports read.
 *
 * Every report on this screen is a comparison against a day: which bucket a
 * policy's expiry falls in, which financial year it was written in, whose
 * birthday is inside the window. If that day were `new Date()` at the point of
 * use, a test would drift and a walkthrough could not be replayed. So the base
 * is a context value: `null` — the default — means the wall clock, and a test
 * supplies a fixed date and gets the same figures every run.
 *
 * The day is also printed on the screen, as "as at", so a figure a person
 * writes down carries the date it was true on.
 */

import { createContext, useContext } from 'react'

export const ReportClockBase = createContext<Date | null>(null)

export function useReportNow(): Date {
  return useContext(ReportClockBase) ?? new Date()
}
