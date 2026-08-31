/**
 * The clock this screen reads — the same discipline as `useInquiryNow` and
 * `useCustomerNow`, and for the same two reasons.
 *
 * A held message says "releasable from 09:00", and whether Release is offered is
 * a comparison against an instant. If that instant were `new Date()` at the point
 * of use, a test asserting "this one is held" would pass at ten at night and fail
 * at ten in the morning.
 *
 * The difference from the other feature clocks is where the offset lives. Theirs
 * is a store the screen owns; this one belongs to the engine, because the engine
 * is what the demo control moves. A screen reading its own offset while the
 * engine ran on another would show a run log stamped in a future the screen
 * cannot see — so the offset is read off the runtime and there is only ever one
 * of it.
 */

import { createContext, useContext } from 'react'
import { currentAutomation } from '../../../data/automation'

const DAY_MS = 86_400_000

/**
 * The instant the engine's offset is measured from. `null` — the default —
 * means the wall clock; a test supplies a fixed date so its assertions do not
 * drift.
 */
export const AutomationClockBase = createContext<Date | null>(null)

/** What every hold, countdown and stamp on this screen reads. */
export function useAutomationNow(): Date {
  const base = useContext(AutomationClockBase) ?? new Date()
  const offsetDays = currentAutomation()?.offsetDays() ?? 0
  return offsetDays === 0 ? base : new Date(base.getTime() + offsetDays * DAY_MS)
}
