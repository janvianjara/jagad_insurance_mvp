/**
 * The three clocks the product runs, as one pure reading.
 *
 * Kept out of the component so the arithmetic can be tested against a fixed
 * `now` without rendering anything, and so a queue can sort on the same reading
 * it displays.
 */
import { formatDistanceStrict } from 'date-fns'
import type { Tone } from '../tone'

export const CLOCK_MODES = {
  /** Turnaround: an allowance that runs down and can be breached. */
  tat: 'Time left against the promised turnaround',
  /** Grace: a lapse window that is already an exception while it is open. */
  grace: 'Time left in the grace window after a due date',
  /** Aging: how long something has been sitting, with no promise attached. */
  aging: 'How long this has been waiting',
} as const

export type ClockMode = keyof typeof CLOCK_MODES

export type ClockInput = {
  mode: ClockMode
  /** When the clock started: assignment, due date, creation. */
  start: Date
  /** The reference moment. Always passed in, so a reading is reproducible. */
  now: Date
  /**
   * The allowance, in milliseconds. Required for `tat` and `grace`, optional
   * for `aging` where it marks the point at which a wait needs a person.
   *
   * It is a parameter and never a constant in this module: turnaround is per
   * company, per product and per priority, and a default here would quietly
   * become the number the business runs on.
   */
  durationMs?: number
  /** Share of the allowance left when the clock turns to warning. */
  warnFraction?: number
}

export type ClockReading = {
  tone: Tone
  text: string
  breached: boolean
  /** Milliseconds to the deadline; negative once past it, null when open-ended. */
  remainingMs: number | null
  elapsedMs: number
}

export function readClock({
  mode,
  start,
  now,
  durationMs,
  warnFraction = 0.25,
}: ClockInput): ClockReading {
  const elapsedMs = now.getTime() - start.getTime()

  if (mode === 'aging') {
    const needsPerson = durationMs !== undefined && elapsedMs >= durationMs
    return {
      tone: needsPerson ? 'attn' : 'idle',
      text: `waiting ${formatDistanceStrict(start, now)}`,
      breached: false,
      remainingMs: durationMs === undefined ? null : durationMs - elapsedMs,
      elapsedMs,
    }
  }

  const allowance = durationMs ?? 0
  const deadline = new Date(start.getTime() + allowance)
  const remainingMs = deadline.getTime() - now.getTime()
  const breached = remainingMs <= 0

  if (mode === 'grace') {
    return {
      // A grace window is an exception even while it is still open.
      tone: breached ? 'bad' : 'warn',
      text: breached
        ? `grace ended ${formatDistanceStrict(deadline, now)} ago`
        : `grace ends in ${formatDistanceStrict(now, deadline)}`,
      breached,
      remainingMs,
      elapsedMs,
    }
  }

  const nearing = !breached && allowance > 0 && remainingMs <= allowance * warnFraction

  return {
    tone: breached ? 'bad' : nearing ? 'warn' : 'ok',
    text: breached
      ? `breached by ${formatDistanceStrict(deadline, now)}`
      : `due in ${formatDistanceStrict(now, deadline)}`,
    breached,
    remainingMs,
    elapsedMs,
  }
}
