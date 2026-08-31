/**
 * The run ledger's mock adapter — FR-21.5.
 *
 * One repository, and it is the only write path in `src/data/mock/` that does not
 * go through `move`, `create`, `append` or `record`. That is deliberate and worth
 * stating, because "every write goes through a machine" is a rule this file looks
 * like an exception to.
 *
 * It is not an exception. Those four helpers exist to stop a caller assigning a
 * status behind a machine's back, and to make sure the change lands in the audit
 * log. A run has no status — it is a decision that has already been made, by a
 * machine, and this row is the record of it. There is nothing here for a machine
 * to guard, and nothing to emit: see the note on `recipe.run_recorded` in
 * `src/domain/events.ts` for why announcing a run on the bus is the one thing
 * this must not do.
 *
 * What it does have is a uniqueness constraint, and that is the whole value.
 * `idempotencyKey` is a unique index, which is what makes the engine safe to run
 * twice: the second write finds the first, returns it, and changes nothing.
 */

import type { RecipeRun, RecipeRunRepository, RecordRunCommand } from '../repo/recipes'
import { committed } from '../repo/result'
import type { Latency } from './latency'
import { runQuery } from './list'
import type { ListSpec } from './list'
import { rowsOf } from './store'
import type { MockStore } from './store'

const RUN_ID_WIDTH = 6

const RUN_LIST_SPEC: ListSpec<RecipeRun> = {
  search: [(run) => run.recipeKey, (run) => run.trigger, (run) => run.reason],
  filters: {
    recipe: (run) => run.recipeKey,
    decision: (run) => run.decision,
    trigger: (run) => run.trigger,
    subject: (run) => run.subjectEntity,
    phase: (run) => run.phase,
  },
  sorts: {
    evaluatedAt: (run) => run.evaluatedAt,
    clockAt: (run) => run.clockAt,
    recipeKey: (run) => run.recipeKey,
    decision: (run) => run.decision,
  },
  /* Newest first: the question somebody opens this with is "what just happened". */
  defaultSort: { field: 'evaluatedAt', direction: 'desc' },
}

export type AutomationDeps = {
  readonly store: MockStore
  readonly latency: Latency
}

export function createAutomationRepositories(deps: AutomationDeps): {
  readonly recipeRuns: RecipeRunRepository
} {
  const { store, latency } = deps
  const t = store.tables
  const wait = () => latency.wait()

  /**
   * Ordinal ids, seeded off what the table already holds. Same reason the event
   * bus counts rather than randomises: two stores built from one fixture set have
   * to produce two identical ledgers, or no test can compare a walkthrough to
   * itself.
   */
  let issued = t.recipeRuns.size

  function nextRunId(): string {
    issued += 1
    return `run-${String(issued).padStart(RUN_ID_WIDTH, '0')}`
  }

  /** The unique index, kept beside the table rather than scanned for on every write. */
  const byKey = new Map<string, string>(
    rowsOf(t.recipeRuns).map((run) => [run.idempotencyKey, run.id]),
  )

  const recipeRuns: RecipeRunRepository = {
    async list(query) {
      await wait()
      return runQuery(rowsOf(t.recipeRuns), RUN_LIST_SPEC, query)
    },
    async get(id) {
      await wait()
      return t.recipeRuns.get(id) ?? null
    },
    async getMany(ids) {
      await wait()
      return ids.map((id) => t.recipeRuns.get(id)).filter((row) => row !== undefined)
    },
    async forRecipe(recipeKey, query) {
      await wait()
      return runQuery(
        rowsOf(t.recipeRuns).filter((run) => run.recipeKey === recipeKey),
        RUN_LIST_SPEC,
        query,
      )
    },
    async forSubject(subjectEntity, subjectId) {
      await wait()
      return rowsOf(t.recipeRuns).filter(
        (run) => run.subjectEntity === subjectEntity && run.subjectId === subjectId,
      )
    },
    async byKey(idempotencyKey) {
      await wait()
      const id = byKey.get(idempotencyKey)
      return id === undefined ? null : (t.recipeRuns.get(id) ?? null)
    },
    async record(command: RecordRunCommand) {
      await wait()

      // A re-run is the engine working, not a fault. The existing row comes back
      // committed so the caller cannot tell a resume from a first run — which is
      // exactly the property that makes a resume safe.
      const existingId = byKey.get(command.idempotencyKey)
      if (existingId !== undefined) {
        const existing = t.recipeRuns.get(existingId)
        if (existing !== undefined) return committed(existing, [])
      }

      const row: RecipeRun = { id: nextRunId(), ...command }
      t.recipeRuns.set(row.id, row)
      byKey.set(row.idempotencyKey, row.id)
      return committed(row, [])
    },
  }

  return { recipeRuns }
}
