/**
 * The clock the policy screens read.
 *
 * Cover ends on a date, and "is this policy still running" is a comparison
 * against an instant. Until this existed the module never made that comparison
 * at all: `POLICY_TONE` painted `issued` green from the status alone, so a term
 * that ran out last quarter went on reading as good standing until somebody
 * happened to record a `policy.lapsed` transition — which, for a policy nobody
 * renewed, is exactly the thing that never happens.
 *
 * Making it a context value rather than a `new Date()` at the point of use is
 * the same call `CustomerClockBase` makes, for the same two reasons: a test
 * asserting "this policy expired three weeks ago" would otherwise drift a day
 * every day, and an expired record could not be demonstrated without waiting for
 * one to expire. `null` — the default — means the wall clock, which is what the
 * running app uses.
 *
 * Nothing here writes a date into a record. Every mutation still passes its own
 * `now` down to the machine, which is what keeps "the clock moved" and "the
 * record changed" separable.
 */

import { createContext, useContext } from 'react'

export const PolicyClockBase = createContext<Date | null>(null)

export function usePolicyNow(): Date {
  return useContext(PolicyClockBase) ?? new Date()
}
