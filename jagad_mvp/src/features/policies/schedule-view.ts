/**
 * How a policy's premium schedule reads — FR-10, decision D-A.
 *
 * The instalments screen at `/renewals/instalments` already reasons about dues,
 * grace and failed mandates across the whole book, and this module deliberately
 * borrows its vocabulary rather than inventing a second one: `INSTALMENT_LABEL`,
 * `INSTALMENT_TONE`, `MODE_LABEL` and `graceEndsOn` are imported from
 * `renewal-view`, so a row that reads "In grace, until 8 September" on the queue
 * reads exactly that on the policy. Two wordings for one fact is how a demo
 * ends up contradicting itself.
 *
 * What this module adds is the per-policy question the queue cannot ask: what
 * does THIS policy owe next, and is the mandate behind it going to pay it. The
 * three things §9 makes true here are all absences:
 *
 *   - nothing divides an annual premium. The figure on a row is
 *     `instalment.amount`, which came from `schedule.instalmentAmount`, which a
 *     person typed off the insurer's schedule;
 *   - nothing here sums money. There is no arrears total and no paid-to-date,
 *     because neither is `Net = sum of components` nor `Final = Net + GST`, and
 *     those are the only two sums this product performs. Counts of rows are
 *     counted; rupees are not;
 *   - nothing here presents a debit. A failed mandate resolves through a person
 *     and a phone call, which is why `MANDATE_NEXT_STEP` is a sentence rather
 *     than a button.
 *
 * No React, no repository, no clock of its own — `now` is passed in, so the
 * screen and this module can never disagree about today.
 */

import { INSTALMENT_STATES, MANDATE_STATES } from '../../domain/workflows'
import type { InstalmentState, MandateState } from '../../domain/workflows'
import type { InstalmentDue, Mandate, MandateEvent, PremiumSchedule } from '../../data/repo'
import type { Tone } from '../../ui/tone'
import { INSTALMENT_LABEL, INSTALMENT_TONE, MODE_LABEL, graceEndsOn } from '../renewals/renewal-view'

export { INSTALMENT_LABEL, INSTALMENT_TONE, MODE_LABEL, graceEndsOn }

const DAY_MS = 86_400_000
/** §9's pattern window, as the instalments screen counts it: two inside three months. */
const PATTERN_WINDOW_DAYS = 90
const PATTERN_THRESHOLD = 2

export const MANDATE_LABEL: Readonly<Record<MandateState, string>> = {
  registered: 'Registered, not yet presented',
  active: 'Active',
  debit_failed: 'Last debit failed',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

/** U7's vocabulary. A failed debit needs a person, so it is lime, not red. */
export const MANDATE_TONE: Readonly<Record<MandateState, Tone>> = {
  registered: 'info',
  active: 'ok',
  debit_failed: 'attn',
  cancelled: 'idle',
  expired: 'warn',
}

export const MANDATE_KIND_LABEL: Readonly<Record<Mandate['kind'], string>> = {
  enach: 'eNACH',
  nach: 'NACH',
  standing_instruction: 'Standing instruction',
}

/**
 * What happens next when a mandate has failed. §9: the platform records what the
 * bank reported, never presents a debit and holds no bank credential — so the
 * next step is always a person.
 */
export const MANDATE_NEXT_STEP =
  'This platform records what the bank reported. It never presents a debit and holds no bank credential, so the next step is a person and a phone call.'

/** The line a policy with no mandate carries. Absent is a state, not a failure. */
export const NO_MANDATE_NOTE =
  'No mandate is registered against this policy. Each instalment is collected by hand, so nothing will be debited automatically.'

/** Instalment states that are settled. Everything else is still owed or still to come. */
const SETTLED: readonly InstalmentState[] = [INSTALMENT_STATES.paid, INSTALMENT_STATES.paidInGrace]

/** Instalment states somebody has to do something about. Same set the queue works. */
export const NEEDS_A_PERSON: readonly InstalmentState[] = [
  INSTALMENT_STATES.due,
  INSTALMENT_STATES.missed,
  INSTALMENT_STATES.inGrace,
  INSTALMENT_STATES.graceExpired,
]

export function isSettled(instalment: InstalmentDue): boolean {
  return SETTLED.includes(instalment.state)
}

export type NextDue = {
  readonly instalment: InstalmentDue
  /** The last day it can still be paid, from THIS schedule's mode. Never a constant. */
  readonly graceEndsOn: string
  /** True where the row is one a person has to work rather than one still to come. */
  readonly needsAPerson: boolean
}

/**
 * The instalment this policy owes next.
 *
 * The earliest unsettled row by due date, which is the one a person is asked
 * about on the phone. A schedule with every row settled returns null and the
 * screen says the schedule is paid up rather than drawing an empty panel as if
 * something were due.
 */
export function nextDue(
  instalments: readonly InstalmentDue[],
  schedule: PremiumSchedule | null,
): NextDue | null {
  const outstanding = [...instalments]
    .filter((row) => !isSettled(row))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  const instalment = outstanding[0]
  if (!instalment || schedule === null) return null

  return {
    instalment,
    graceEndsOn: graceEndsOn(instalment.dueDate, schedule.graceDays),
    needsAPerson: NEEDS_A_PERSON.includes(instalment.state),
  }
}

/** How many rows sit in each state. A count of rows, never a sum of money. */
export function instalmentTally(
  instalments: readonly InstalmentDue[],
): readonly { readonly state: InstalmentState; readonly count: number }[] {
  return Object.values(INSTALMENT_STATES)
    .map((state) => ({
      state,
      count: instalments.filter((row) => row.state === state).length,
    }))
    .filter((entry) => entry.count > 0)
}

export type MandateReading = {
  readonly state: MandateState
  readonly label: string
  readonly tone: Tone
  /** True where the mandate is the thing that needs a person right now. */
  readonly failing: boolean
  /** §9: two failures inside three months is a pattern worth surfacing to the agent. */
  readonly pattern: boolean
  readonly failures: readonly MandateEvent[]
  readonly lastFailureAt: string | null
}

/**
 * Where the mandate stands, and whether its failures make a pattern.
 *
 * `failing` reads the recorded state rather than the events, because the state
 * is what the machine moved to and the events are what the bank said. They
 * agree in the fixtures and they are still read separately: a mandate somebody
 * cancelled after a failure is not failing any more, and a screen that inferred
 * the state from the event log would keep saying it was.
 */
export function readMandate(
  mandate: Mandate,
  events: readonly MandateEvent[],
  now: Date,
): MandateReading {
  const failures = events
    .filter((event) => event.outcome === 'failure')
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))

  const since = new Date(now.getTime() - PATTERN_WINDOW_DAYS * DAY_MS).toISOString()

  return {
    state: mandate.state,
    label: MANDATE_LABEL[mandate.state],
    tone: MANDATE_TONE[mandate.state],
    failing: mandate.state === MANDATE_STATES.debitFailed,
    pattern: failures.filter((event) => event.occurredAt >= since).length >= PATTERN_THRESHOLD,
    failures,
    lastFailureAt: failures.at(-1)?.occurredAt ?? null,
  }
}
