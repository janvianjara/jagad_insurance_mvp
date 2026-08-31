/**
 * The ledger read, and the engine the screen is watching — FR-21.5.
 *
 * Two hooks, and they answer different questions. `useRecipeRuns` reads the run
 * ledger through the repository like any other record, so it works in a test
 * with no engine running at all. `useAutomationEngine` asks whether there IS an
 * engine on this page, because the outbox and the demo clock are properties of
 * the process rather than of the data and a screen that pretended otherwise
 * would render an empty outbox as though nothing were waiting.
 */

import { useSyncExternalStore } from 'react'
import { currentAutomation, onAutomationChange } from '../../../data/automation'
import type { AutomationRuntime } from '../../../data/automation'
import { useRepositories } from '../../../app/repositories-context'
import { useResource } from '../../../lib/useResource'
import type { Resource } from '../../../lib/useResource'
import type { Page, RecipeRun } from '../../../data/repo'

/**
 * One page is enough and one page is the point: every count on the screen comes
 * from the same read, so the totals in the recipe list and the rows in the log
 * cannot disagree with each other.
 */
export const RUN_PAGE_SIZE = 300

export function useRecipeRuns(revision: number): Resource<Page<RecipeRun>> {
  const repositories = useRepositories()
  return useResource(
    () => repositories.recipeRuns.list({ pageSize: RUN_PAGE_SIZE }),
    `recipe-runs:${revision}`,
  )
}

/** The engine on this page, or null. Re-renders when one starts or stops. */
export function useAutomationEngine(): AutomationRuntime | null {
  return useSyncExternalStore(onAutomationChange, currentAutomation, () => null)
}

/** The outbox contents, re-read whenever the engine changes them. */
export function useStagedMessages(runtime: AutomationRuntime | null) {
  return useSyncExternalStore(
    (listener) => runtime?.outbox.subscribe(listener) ?? (() => undefined),
    () => runtime?.outbox.list() ?? EMPTY,
    () => EMPTY,
  )
}

const EMPTY: never[] = []
