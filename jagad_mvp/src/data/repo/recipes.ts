/**
 * The run ledger — FR-21.5, plan §7.
 *
 * FR-21.5 asks that every automated action trace back to a recipe and a trigger.
 * Until now that was not demonstrable, because nothing recorded that a recipe had
 * run — the events a recipe emitted were indistinguishable from the events a
 * person's save emitted, and a recipe that decided *not* to act left no trace at
 * all. This is the row that closes it.
 *
 * ## Every evaluation writes one, including the ones that declined
 *
 * `fired`, `skipped` and `refused` are all rows. That is the whole point: the
 * question the automation screen has to answer is not "what did the platform
 * send?" — the message log already answers that — it is "why was nobody told?".
 * A ledger that recorded only its successes would be silent on exactly the
 * question somebody opens it to ask.
 *
 * ## Two timestamps, not one
 *
 * `evaluatedAt` is when the worker ran. `clockAt` is the instant it claimed as
 * "now". They are the same on a live tick and different on a catch-up, a resume
 * or a test that fixed the clock — and splitting them is what lets a walkthrough
 * be replayed and assert the same sentences every run. `TaskClockBase` already
 * makes the same split for the UI.
 *
 * ## The key has no timestamp in it
 *
 * `idempotencyKey` is derived from the record, the recipe version and the
 * occurrence, and never from the moment of execution — see `runKey` in
 * `src/domain/automation/ledger.ts`. That is what makes the engine safe to run
 * twice, safe to resume after a closed laptop, and safe to replay in a test. A
 * key carrying an instant would be a new key every run, which is the same as
 * having no key at all.
 */

import type { DomainEventName } from '../../domain/events'
import type { RunDecision } from '../../domain/automation'
import type { ListQuery, Page, ReadRepository } from './query'
import type { MutationResult } from './result'

export type RecipeRun = {
  readonly id: string
  /** Unique. A second write under the same key is a no-op, not a duplicate row. */
  readonly idempotencyKey: string
  readonly recipeKey: string
  /** An edit publishes a version; a run pins the one it started under. */
  readonly recipeVersion: number
  /** `DomainEventName`, or `clock.tick` for a time-triggered run. */
  readonly trigger: string
  /** What it was about. Null when the trigger carried no subject. */
  readonly subjectEntity: string | null
  readonly subjectId: string | null
  /** The ladder rung, when a ladder produced this run. */
  readonly phase: string | null
  readonly decision: RunDecision
  /** The machine's own sentence, unedited. Render it. */
  readonly reason: string
  /** What this run emitted, in order. Empty for a skip or a refusal. */
  readonly emitted: readonly DomainEventName[]
  /** When the worker actually ran. */
  readonly evaluatedAt: string
  /** The instant it claimed as "now". */
  readonly clockAt: string
  /** The triggering event's id, when a recipe caused this one. */
  readonly causedBy: string | null
  /** Recipe keys that led here, oldest first. The depth guard writes the chain. */
  readonly chain: readonly string[]
}

/**
 * What the dispatcher hands over. `id` is the repository's to assign, and the
 * caller supplies no state — there is no state on a run, only a decision that
 * has already been made.
 */
export type RecordRunCommand = Omit<RecipeRun, 'id'>

export type RecipeRunRepository = ReadRepository<RecipeRun> & {
  /** The run log for one recipe, newest first. `/config/automation` reads it. */
  forRecipe(recipeKey: string, query?: ListQuery): Promise<Page<RecipeRun>>
  /** Every run that touched one record — the traceability half of FR-21.5. */
  forSubject(subjectEntity: string, subjectId: string): Promise<readonly RecipeRun[]>
  /** Null when that key has never run. The idempotency read, before a write. */
  byKey(idempotencyKey: string): Promise<RecipeRun | null>
  /**
   * Writes one. A key already on the books returns the run that is there and
   * writes nothing — a re-run is not an error, it is the engine working.
   */
  record(command: RecordRunCommand): Promise<MutationResult<RecipeRun>>
}
