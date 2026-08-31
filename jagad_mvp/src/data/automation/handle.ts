/**
 * Where a screen finds the running engine — FR-21.
 *
 * Almost everything `/config/automation` needs it reads through a repository:
 * the recipes come from `ConfigRepository`, the runs from `RecipeRunRepository`.
 * Two things do not, and both are properties of the process rather than of the
 * data — what is prepared and waiting in the outbox, and the clock the engine is
 * standing on. Neither has a repository to live behind, and inventing one would
 * mean changing a shared interface for a value that does not survive a reload
 * anyway.
 *
 * So the runtime registers itself here when it starts and clears itself when it
 * stops, and a screen asks for it by name. It is a module-level singleton, which
 * is a thing worth being uncomfortable about, so the shape is deliberately as
 * small as it can be: register, read, subscribe. There is exactly one engine per
 * page because there is exactly one composition root, and a test that wants one
 * calls `startAutomation` directly and never touches this.
 *
 * A screen must handle `null`. A test renders the automation screen with its own
 * repositories and no engine at all, and the screen has to say so honestly
 * rather than render an empty outbox as though nothing were waiting.
 */

import type { AutomationRuntime } from './runtime'

let current: AutomationRuntime | null = null
const listeners = new Set<() => void>()

export function setCurrentAutomation(runtime: AutomationRuntime | null): void {
  current = runtime
  for (const listener of listeners) listener()
}

/** The engine on this page, or null when none was started. */
export function currentAutomation(): AutomationRuntime | null {
  return current
}

/** Fires when the engine appears or goes away. */
export function onAutomationChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
