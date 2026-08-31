/**
 * What each recipe has actually done — FR-21.5, read from the run ledger.
 *
 * The automation screen used to answer one question, "what is this rule
 * configured to do?", and could not answer the one a client asks second: "and
 * has it?". A recipe row said `active` whether it had fired ten thousand times
 * or never once, because nothing recorded a run. The ledger records them now, so
 * this folds it into the three numbers a row can carry — when it last fired, how
 * often it has, and how many times it declined.
 *
 * Skips are counted separately from fires and shown separately, which is the
 * whole point of the panel. "Fired 40 times" is a boast; "fired 40, declined 12,
 * most recently because consent was withdrawn" is an operational fact somebody
 * can act on, and it is the sentence FR-17.3 asks the platform to be able to
 * produce.
 *
 * Pure, and over rows already read. No repository call here: the screen loads
 * the ledger page once and every count on it comes from that one read.
 */

import type { RunDecision } from '../../../domain/automation'
import type { RecipeRun } from '../../../data/repo'

export type RecipeActivity = {
  readonly total: number
  readonly fired: number
  readonly skipped: number
  readonly refused: number
  /** The last run that actually did something. Null when it never has. */
  readonly lastFiredAt: string | null
  /** The most recent run of any kind, so a row can say "reached, and declined". */
  readonly lastRunAt: string | null
  /** The newest reason it declined, rendered as the engine wrote it. */
  readonly lastDeclineReason: string | null
}

export const NO_ACTIVITY: RecipeActivity = {
  total: 0,
  fired: 0,
  skipped: 0,
  refused: 0,
  lastFiredAt: null,
  lastRunAt: null,
  lastDeclineReason: null,
}

function later(left: string | null, right: string): string {
  return left === null || right > left ? right : left
}

/** Every recipe's activity, keyed by recipe key. Recipes with none are absent. */
export function activityByRecipe(
  runs: readonly RecipeRun[],
): Readonly<Record<string, RecipeActivity>> {
  const byKey = new Map<string, RecipeActivity>()

  for (const run of runs) {
    const current = byKey.get(run.recipeKey) ?? NO_ACTIVITY
    const declined = run.decision !== 'fired'

    byKey.set(run.recipeKey, {
      total: current.total + 1,
      fired: current.fired + (run.decision === 'fired' ? 1 : 0),
      skipped: current.skipped + (run.decision === 'skipped' ? 1 : 0),
      refused: current.refused + (run.decision === 'refused' ? 1 : 0),
      lastFiredAt:
        run.decision === 'fired' ? later(current.lastFiredAt, run.clockAt) : current.lastFiredAt,
      lastRunAt: later(current.lastRunAt, run.clockAt),
      lastDeclineReason:
        declined && (current.lastRunAt === null || run.clockAt >= current.lastRunAt)
          ? run.reason
          : current.lastDeclineReason,
    })
  }

  return Object.fromEntries(byKey)
}

export function activityOf(
  activity: Readonly<Record<string, RecipeActivity>>,
  recipeKey: string,
): RecipeActivity {
  return activity[recipeKey] ?? NO_ACTIVITY
}

/** How a decision reads on screen. The ledger's words, not a synonym. */
export const DECISION_LABELS: Readonly<Record<RunDecision, string>> = {
  fired: 'Fired',
  skipped: 'Declined',
  refused: 'Refused',
}

/**
 * Green for a run that did what it was configured to do, lime for one that
 * declined — lime is "needs a person", and a skip is exactly that — and red for
 * a refusal, which is the engine saying it would not.
 */
export const DECISION_TONES: Readonly<Record<RunDecision, 'ok' | 'attn' | 'bad'>> = {
  fired: 'ok',
  skipped: 'attn',
  refused: 'bad',
}
