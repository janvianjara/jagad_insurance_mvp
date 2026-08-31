/**
 * The clock the renewal and instalment screens read.
 *
 * Both of this module's clocks are comparisons against an instant. A renewal is
 * in the pool when `now` has passed `expiry - leadDays`; an instalment is in
 * grace until `now` passes `dueDate + graceDays`. Reading that instant with a
 * `new Date()` at the point of use cost this module a test: scenario 5.5 typed
 * a new term starting `2026-08-29`, which was in the future on the day it was
 * written and is in the past now, so the screen took its backdating branch and
 * the confirm gate the test waited for stopped rendering. Nothing about the
 * renewal logic changed. The wall clock moved, which is what wall clocks do.
 *
 * So the base is a context value, the same call `CustomerClockBase` and
 * `PolicyClockBase` make. `null` — the default — means the wall clock, which is
 * what the running app uses; a test supplies a fixed date and gets the same
 * sentence every run, and a walkthrough can be shown a policy two days past
 * expiry without anybody waiting for one to expire.
 *
 * Nothing here writes a date into a record. Every mutation still passes its own
 * `now` down to the machine, which is what keeps "the clock moved" and "the
 * record changed" separable.
 */

import { createContext, useContext } from 'react'

export const RenewalClockBase = createContext<Date | null>(null)

export function useRenewalNow(): Date {
  return useContext(RenewalClockBase) ?? new Date()
}
