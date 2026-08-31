/**
 * The tick — plan §7, FR-21, FR-12.1/.3.
 *
 * This is the piece the platform has been missing. `src/domain/events.ts` has
 * carried `on`/`onAny` since P-02 and the only production subscriber in the tree
 * is the audit sink, so a `renewal.reminder` recipe seeded active against a real
 * trigger with a real template has never once fired. Event-triggered recipes
 * need a subscriber; time-triggered ones need this, because no event is emitted
 * when a date simply arrives.
 *
 * It is a pure function rather than a scheduler, and that is the important call.
 * A cron holds the answer in its own timers, so a browser closed for a week
 * loses the rungs that passed while it was shut. This asks a different question
 * — "given these records and this instant, what should have fired by now?" — and
 * answers it identically however many times it is asked, from whatever process
 * asks. Missing a week costs nothing. There is nothing to replay.
 *
 * ## Catch-up collapses
 *
 * The rule that stops this being a spam engine: at most ONE rung per record per
 * evaluation, and it is the most recent one. A policy imported ten days before
 * expiry has passed the 45, 30 and 15-day rungs already; sending all three is
 * three messages in a second, which is worse than sending none. So the latest
 * passed rung is dispatched and the earlier ones are returned as `supersedes` —
 * recorded in the ledger, never sent, so they cannot fire on the next
 * evaluation and walk the ladder backwards.
 *
 * ## What this does not do
 *
 * It produces no message, decides nothing about money, and touches no record. A
 * tick is an intention to call a desk method, and the desk method runs the same
 * guards a person's button press runs — including the one that refuses a bare
 * renewal reminder carrying no year-wise amounts. Automation is a caller of the
 * machines here, never a peer of them, which is what stops it becoming the one
 * path in the system that can reach a customer without passing a guard.
 */

import { rungInstant } from './ladder'
import type { Ladder } from './ladder'
import { firedKey } from './ledger'

/**
 * The shape a record must present to be schedulable. Structural and deliberately
 * small, so the same tick serves a renewal task, an instalment, a stalled
 * quotation and an inquiry past its TAT without any of them being named here.
 */
export type DueRecord = {
  readonly id: string
  /** The instant the ladder is measured against: an expiry, a due date, a raise time. */
  readonly anchorDate: string
  /** Sends already made against this record, counted against the ladder's ceiling. */
  readonly sentCount: number
  /**
   * Whether this record still wants nudging. A renewal that has been renewed or
   * lapsed, an instalment that has been paid, is closed to the ladder — and it
   * is the caller that knows which states mean that, not this module.
   */
  readonly open: boolean
}

/** A rung that passed unobserved. Recorded so it cannot fire later; never sent. */
export type SupersededRung = {
  readonly offsetDays: number
  readonly firedFor: string
}

export type DueTick = {
  readonly recordId: string
  readonly recipeKey: string
  readonly recipeVersion: number
  /** Signed: positive is before the anchor, negative is a grace rung after it. */
  readonly offsetDays: number
  /** The idempotency key for this rung. The runtime writes it before dispatching. */
  readonly firedFor: string
  readonly supersedes: readonly SupersededRung[]
}

export type TickInput = {
  readonly records: readonly DueRecord[]
  readonly ladder: Ladder
  readonly recipeKey: string
  readonly recipeVersion: number
  readonly now: Date
  /** Keys already in the ledger. Read-only here: this function writes nothing. */
  readonly fired: ReadonlySet<string>
}

/**
 * What should have fired by now, at most one rung per record.
 *
 * Rungs are compared on the signed number line `ladder.rungs` already sorts:
 * a smaller offset is a later instant, so the most recent passed rung is the
 * unfired one with the smallest offset, whichever side of the anchor it fell on.
 */
export function dueTicks(input: TickInput): readonly DueTick[] {
  const { records, ladder, recipeKey, recipeVersion, now, fired } = input
  const ticks: DueTick[] = []

  for (const record of records) {
    if (!record.open) continue
    if (record.sentCount >= ladder.maxSends) continue

    // Passed rungs, latest first. `rungInstant` throws on an unreadable anchor
    // rather than skipping the record: a date that will not parse is a data
    // fault to fix, and a tick that silently ignores records is how a renewal
    // goes quiet without anybody being told.
    const passed = ladder.rungs
      .filter((offsetDays) => now.getTime() >= rungInstant(record.anchorDate, offsetDays).getTime())
      .sort((left, right) => left - right)

    const unfired = passed
      .map((offsetDays) => ({
        offsetDays,
        firedFor: firedKey({ recordId: record.id, recipeKey, recipeVersion, offsetDays }),
      }))
      .filter((rung) => !fired.has(rung.firedFor))

    const [target, ...earlier] = unfired
    if (target === undefined) continue

    ticks.push({
      recordId: record.id,
      recipeKey,
      recipeVersion,
      offsetDays: target.offsetDays,
      firedFor: target.firedFor,
      supersedes: earlier,
    })
  }

  return ticks
}
