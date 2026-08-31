/**
 * The rule that makes this a CRM rather than a list — FR-06.15.
 *
 * §9.1 of the PRD ends at the TAT fork and §9.2 opens with the customer and the
 * candidate policies already chosen. Between those two sentences somebody rings
 * the customer, and until now nothing recorded that call, what came of it, or
 * when to speak next. An inquiry could reach `accepted` and sit there forever:
 * the TAT clock only ever measured confirmation, so a lead nobody had spoken to
 * looked exactly like a lead being worked.
 *
 * One constraint fixes that, and it is the whole of this module:
 *
 *   An open inquiry may not be left without a dated next action.
 *
 * So logging an activity demands one of two things — a next action with a date,
 * or an outcome that closes the inquiry. There is no third answer, and in
 * particular there is no "save and decide later", because that is the state the
 * rule exists to abolish.
 *
 * The refusals are prose, in the same shape every §9 machine uses, so a screen
 * can ask before it draws the control and disable it with the sentence the write
 * would have refused with.
 */

import { allow, refuse } from './machine'
import type { TransitionResult } from './machine'

/** What the caller intends to happen next, and when. */
export type NextAction = {
  /** The task kind to raise. Matches `TaskKind` in the data layer. */
  readonly kind: string
  /** ISO instant. Must be in the future relative to `now`. */
  readonly dueAt: string
  readonly note?: string
  readonly assigneeId?: string
}

/**
 * What the chosen disposition says about the activity being logged, taken from
 * the `Disposition` config row rather than from a switch statement here. §9's
 * rule about TAT applies to this too: the vocabulary is data an admin edits, and
 * this module holds no list of dispositions and no default retry interval.
 */
export type DispositionRule = {
  readonly key: string
  readonly label: string
  /** True when this outcome closes the inquiry, so no next action is owed. */
  readonly terminal: boolean
  readonly requiresNextAction: boolean
  /** Lost needs a reason; FR-06.10 already said so and this keeps it true here. */
  readonly requiresReason: boolean
}

export type NextActionContext = {
  readonly now: Date
  readonly disposition: DispositionRule | null
  readonly nextAction?: NextAction | null
  /** The reason typed on screen, for the dispositions that demand one. */
  readonly reason?: string | null
}

/**
 * The furthest a next action may be pushed out, in days.
 *
 * Not a business rule about follow-up cadence — that belongs to the recipe — but
 * a bound on obvious mistakes. A callback dated three years out is a typo, and
 * accepting it silently would put a lead beyond every ageing report in the
 * product, which is precisely the disappearance this module exists to prevent.
 */
export const MAX_NEXT_ACTION_DAYS = 400

const DAY_MS = 86_400_000

/**
 * May this activity be logged?
 *
 * Reads as the sentence the person on screen would say: pick an outcome, and
 * then either say what happens next and when, or say it is closed.
 */
export function nextActionSatisfied(ctx: NextActionContext): TransitionResult {
  const { now, disposition, nextAction, reason } = ctx

  if (!disposition) {
    return refuse(
      'Choose what came of this contact before logging it. An activity without an outcome is a note nobody can report on.',
    )
  }

  if (disposition.requiresReason && (reason ?? '').trim() === '') {
    return refuse(
      `"${disposition.label}" closes this inquiry, so the reason is compulsory. Lost-reason reporting is only worth reading when this is filled in.`,
    )
  }

  if (disposition.terminal) {
    // A closed inquiry owes nobody a next action, and demanding one would leave
    // a task pointing at something finished.
    return allow()
  }

  if (!disposition.requiresNextAction) return allow()

  if (!nextAction || nextAction.dueAt.trim() === '') {
    return refuse(
      `"${disposition.label}" leaves this inquiry open, so it needs a next action with a date. An open inquiry without one is how a lead goes quiet and nobody notices.`,
    )
  }

  const due = new Date(nextAction.dueAt)
  if (Number.isNaN(due.getTime())) {
    return refuse('That next-action date could not be read. Pick a date and time.')
  }

  if (due.getTime() <= now.getTime()) {
    return refuse(
      'The next action is dated in the past, so nothing would ever surface it. Pick a date and time still to come.',
    )
  }

  if (due.getTime() - now.getTime() > MAX_NEXT_ACTION_DAYS * DAY_MS) {
    return refuse(
      `A next action more than ${MAX_NEXT_ACTION_DAYS} days out is almost always a mistyped year, and it would put this inquiry beyond every ageing report. Pick a nearer date.`,
    )
  }

  if (nextAction.kind.trim() === '') {
    return refuse('Say what the next action is, not only when it happens.')
  }

  return allow()
}

/**
 * Is this inquiry carrying its obligation right now?
 *
 * The read side of the same rule, and the arithmetic behind the KPI that
 * replaces "% confirmed within TAT" as the number worth watching: an inquiry
 * that is open, has no dated next action, is one that has quietly stopped being
 * worked.
 */
export function nextActionOverdue(
  nextActionAt: string | null,
  now: Date,
): boolean {
  if (nextActionAt === null) return false
  const due = new Date(nextActionAt)
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime()
}
