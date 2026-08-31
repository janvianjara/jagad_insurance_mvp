/**
 * The automation working set — plan §4, `/config/automation`: "recipe params P1;
 * visual builder P3".
 *
 * P1 is the parameters, and that boundary is deliberate rather than a shortcut.
 * A recipe's trigger is a P-02 event name and its guards are code; what an
 * agency actually changes month to month is the numbers and the names those
 * guards read — how long a TAT allows, who a lapse escalates to, how many days
 * ahead a renewal opens. Editing those is the whole of D1's promise for
 * automation, and it needs no node editor to keep.
 *
 * So this store edits `parameters` and `active`, and nothing else. The trigger
 * and the key are shown and never edited: a recipe that changed which event it
 * subscribes to would be a different recipe, and every record already written
 * names this one.
 *
 * Every parameter edit publishes a new version, for the reason the repository
 * gives: a TAT that changed last Tuesday must not rewrite what happened last
 * Monday.
 */

import { create } from 'zustand'
import type {
  ConfigRepository,
  MessageTemplate,
  Recipe,
  RecipeParameters,
} from '../../../data/repo'
import type { ConfigStatus } from '../shared'

export type AutomationState = {
  readonly status: ConfigStatus
  readonly error: Error | null
  /** Bumped by every mutation; the screen remounts its queue on it. */
  readonly revision: number
  readonly recipes: readonly Recipe[]
  /** For the parameters that name a template by key. */
  readonly templates: readonly MessageTemplate[]

  hydrate(config: ConfigRepository): Promise<void>
  reset(): void

  saveParameters(recipeId: string, parameters: RecipeParameters): void
  setRecipeActive(recipeId: string, active: boolean): void
}

const EMPTY = {
  status: 'idle' as ConfigStatus,
  error: null,
  revision: 0,
  recipes: [] as readonly Recipe[],
  templates: [] as readonly MessageTemplate[],
}

export const useAutomationStore = create<AutomationState>((set, get) => ({
  ...EMPTY,

  async hydrate(config) {
    const state = get()
    if (state.status === 'loading' || state.status === 'ready') return
    set({ status: 'loading', error: null })

    try {
      const [recipes, templates] = await Promise.all([config.recipes(), config.templates()])
      set({
        status: 'ready',
        error: null,
        revision: get().revision + 1,
        recipes,
        templates,
      })
    } catch (cause) {
      set({
        status: 'error',
        error: cause instanceof Error ? cause : new Error('Recipes could not be read.'),
      })
    }
  },

  reset() {
    set({ ...EMPTY })
  },

  /**
   * A new version of the recipe, not a rewrite of the old one. What ran on
   * Monday ran under Monday's parameters, and an audit that cannot say which
   * numbers were in force is an audit nobody can act on.
   */
  saveParameters(recipeId, parameters) {
    const state = get()
    set({
      revision: state.revision + 1,
      recipes: state.recipes.map((recipe) =>
        recipe.id === recipeId
          ? {
              ...recipe,
              parameters,
              version: recipe.version + 1,
              updatedAt: new Date().toISOString(),
            }
          : recipe,
      ),
    })
  },

  setRecipeActive(recipeId, active) {
    const state = get()
    set({
      revision: state.revision + 1,
      recipes: state.recipes.map((recipe) =>
        recipe.id === recipeId ? { ...recipe, active, updatedAt: new Date().toISOString() } : recipe,
      ),
    })
  },
}))

export function recipeById(recipes: readonly Recipe[], id: string): Recipe | null {
  return recipes.find((recipe) => recipe.id === id) ?? null
}
