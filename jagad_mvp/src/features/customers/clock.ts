/**
 * The clock the customer, KYC and consent screens read.
 *
 * A consent link expires, and an expiry is a comparison against an instant. If
 * that instant were `new Date()` at the point of use, two things would break:
 * a test asserting "this link has five days left" would drift a day every day,
 * and the expired-link page could never be demonstrated without waiting a week.
 *
 * So the base is a context value. `null` — the default — means the wall clock,
 * which is what the running app uses; a test supplies a fixed date and gets the
 * same sentence every run. Nothing here writes a date into a record: every
 * mutation still passes its own `now` down to the machine, which is what keeps
 * "the clock moved" and "the record changed" separable.
 */

import { createContext, useContext } from 'react'

export const CustomerClockBase = createContext<Date | null>(null)

export function useCustomerNow(): Date {
  return useContext(CustomerClockBase) ?? new Date()
}
