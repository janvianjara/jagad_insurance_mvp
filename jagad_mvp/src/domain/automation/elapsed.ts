/**
 * What has been waiting too long — FR-21, D9, plan §9.
 *
 * `ticks.ts` walks a ladder of rungs before and after an anchor: 45, 30, 15 days
 * from an expiry. This is the other shape of "a date arrived", and it is the one
 * D9 actually names first — a deadline the record carries on itself has passed
 * and nobody noticed. An inquiry's `tatDueAt`. A task's `dueAt`. One rung, on the
 * record rather than in a recipe parameter, and therefore no threshold for this
 * module to hold or to invent.
 *
 * That distinction is worth stating because it is what makes this safe to ship
 * without a recipe to configure it: `ladder.ts` refuses to run without a ceiling
 * because a ladder with no ceiling is a spam engine, and the reason it can refuse
 * is that the ceiling is configuration. There is nothing to configure here. The
 * allowance was already decided when the record was written — by the routing
 * recipe's `tatMinutes` for an inquiry, by the person who set the callback date
 * for a task — and this only asks whether the instant it produced has passed.
 *
 * ## One breach per deadline, not one per evaluation
 *
 * The engine is re-entrant by design, so the same overdue inquiry is overdue on
 * every tick for as long as it stays open. Without a key that is a breach
 * notification every thirty seconds. The key is the record, the recipe version
 * and the deadline instant — never the moment of evaluation — so the second
 * evaluation computes the same key and the ledger's unique index turns it into a
 * no-op. Move the deadline and the key moves with it, which is right: a TAT that
 * was extended is a new deadline and deserves a new breach when it passes.
 */

/**
 * The shape a record must present to be swept. Structural and deliberately
 * small, so one sweep serves an inquiry past its TAT, a task past its callback
 * date and anything later that carries its own deadline.
 */
export type DeadlineRecord = {
  readonly id: string
  /** The deadline the record carries. Null means nothing was promised. */
  readonly dueAt: string | null
  /** Whether this record still wants chasing. Closed records are not late. */
  readonly open: boolean
}

export type ElapsedTick = {
  readonly recordId: string
  readonly recipeKey: string
  readonly recipeVersion: number
  /** The deadline that passed, echoed so the ledger's sentence can name it. */
  readonly dueAt: string
  /** Whole minutes late at the instant of evaluation. Reported, never rounded up. */
  readonly lateByMinutes: number
  /** The idempotency key for this breach. The runtime writes it before dispatching. */
  readonly firedFor: string
}

export type ElapsedInput = {
  readonly records: readonly DeadlineRecord[]
  readonly recipeKey: string
  readonly recipeVersion: number
  readonly now: Date
}

const MINUTE_MS = 60_000

/**
 * The key for one breach: record, recipe version, deadline. No timestamp of
 * execution anywhere in it — see the note at the top of this file.
 */
export function breachKey(parts: {
  readonly recordId: string
  readonly recipeKey: string
  readonly recipeVersion: number
  readonly dueAt: string
}): string {
  return `${parts.recordId}:${parts.recipeKey}:v${parts.recipeVersion}:due${parts.dueAt}`
}

/**
 * Which records are past the deadline they carry.
 *
 * A deadline that will not parse is skipped rather than thrown on, unlike
 * `rungInstant`, and the asymmetry is deliberate: a ladder anchor is a field the
 * whole recipe is measured against and an unreadable one means the ladder is
 * broken, while a single record with a corrupt date should not stop the sweep
 * finding the other forty that are genuinely late.
 */
export function elapsedTicks(input: ElapsedInput): readonly ElapsedTick[] {
  const { records, recipeKey, recipeVersion, now } = input
  const ticks: ElapsedTick[] = []

  for (const record of records) {
    if (!record.open) continue
    if (record.dueAt === null) continue

    const due = new Date(record.dueAt).getTime()
    if (Number.isNaN(due)) continue
    if (due > now.getTime()) continue

    ticks.push({
      recordId: record.id,
      recipeKey,
      recipeVersion,
      dueAt: record.dueAt,
      lateByMinutes: Math.floor((now.getTime() - due) / MINUTE_MS),
      firedFor: breachKey({ recordId: record.id, recipeKey, recipeVersion, dueAt: record.dueAt }),
    })
  }

  return ticks
}
