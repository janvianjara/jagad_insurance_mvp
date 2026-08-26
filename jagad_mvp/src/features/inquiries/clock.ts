/**
 * The clock this module reads, and the one control that can move it.
 *
 * Every TAT reading on these screens comes from here rather than from
 * `new Date()` at the point of use, for two reasons that are the same reason:
 *
 *   - a walkthrough has to be able to show a TAT lapsing. Waiting an hour in
 *     front of the client is not a demo, so the dev-only control offsets this
 *     clock and every countdown, stripe and disabled action re-reads it at once;
 *   - a test has to be able to pin it. The base is a context value, so a test
 *     renders against a fixed instant and gets the same sentence every run.
 *
 * The offset lives in a store rather than in a provider's state because the
 * queue and the detail screen are separate routes: advancing the clock on one
 * and navigating to the other must not quietly rewind it.
 *
 * Nothing here writes a date into a record. The offset is a reading, and every
 * mutation still passes its own `now` down to the machine, which is what keeps
 * "the clock moved" and "the record changed" separable.
 */

import { createContext, useContext } from 'react'
import { create } from 'zustand'

const MINUTE_MS = 60_000

/** Steps the dev control offers, in minutes. */
export const CLOCK_STEPS = [15, 60, 240] as const

export type InquiryClockState = {
  /** How far ahead of the base instant this module is reading. */
  readonly offsetMs: number
  advanceMinutes(minutes: number): void
  reset(): void
}

export const useInquiryClockStore = create<InquiryClockState>((set) => ({
  offsetMs: 0,
  advanceMinutes(minutes) {
    set((state) => ({ offsetMs: state.offsetMs + minutes * MINUTE_MS }))
  },
  reset() {
    set({ offsetMs: 0 })
  },
}))

/**
 * The instant the offset is measured from. `null` — the default — means the wall
 * clock. A test supplies a fixed date so its assertions do not drift.
 */
export const InquiryClockBase = createContext<Date | null>(null)

/** What every clock, stripe and guard on these screens reads. */
export function useInquiryNow(): Date {
  const base = useContext(InquiryClockBase)
  const offsetMs = useInquiryClockStore((state) => state.offsetMs)
  const anchor = base ?? new Date()
  return offsetMs === 0 ? anchor : new Date(anchor.getTime() + offsetMs)
}

/** Minutes the demo clock has been pushed forward. Zero means untouched. */
export function useInquiryClockOffsetMinutes(): number {
  return Math.round(useInquiryClockStore((state) => state.offsetMs) / MINUTE_MS)
}
