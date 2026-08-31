/**
 * The clock the task queue reads.
 *
 * A due date is a comparison against an instant. If that instant were
 * `new Date()` at the point of use, a test asserting "this one is overdue" would
 * drift with the wall clock and a walkthrough could not be replayed. So the base
 * is a context value: `null` — the default — means the wall clock, which is what
 * the running app uses, and a test supplies a fixed date and gets the same
 * sentence every run.
 *
 * Nothing here writes a date into a record. Completion still passes its own
 * `now` down to the repository, which is what keeps "the clock moved" and "the
 * record changed" separable.
 */

import { createContext, useContext } from 'react'

export const TaskClockBase = createContext<Date | null>(null)

export function useTaskNow(): Date {
  return useContext(TaskClockBase) ?? new Date()
}
