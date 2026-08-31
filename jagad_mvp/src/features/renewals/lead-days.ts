/**
 * The renewal lead time, read from configuration.
 *
 * §9 is explicit: "the lead is a configuration parameter and this module holds
 * no default." So this reads `leadDays` off the `renewal.schedule` recipe an
 * admin edits and returns `null` when the recipe is absent or holds no number —
 * a screen with no lead shows the machine's own refusal rather than inventing
 * a fortnight of its own.
 */

import type { Recipe } from '../../data/repo'

export const RENEWAL_SCHEDULE_RECIPE = 'renewal.schedule'
export const RENEWAL_REMINDER_RECIPE = 'renewal.reminder'

export function leadDaysOrNull(recipes: readonly Recipe[]): number | null {
  const recipe = recipes.find((row) => row.key === RENEWAL_SCHEDULE_RECIPE && row.active)
  const value = recipe?.parameters.leadDays
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * The lead as a number the queue can pass to a command. `-1` is deliberately not
 * a fallback lead: it is a value the machine's guard refuses, which is what
 * "this module holds no default" has to look like at a call site that needs one.
 */
export function readLeadDays(recipes: readonly Recipe[]): number {
  return leadDaysOrNull(recipes) ?? -1
}

export function maxReminders(recipes: readonly Recipe[]): number | null {
  const recipe = recipes.find((row) => row.key === RENEWAL_REMINDER_RECIPE && row.active)
  const value = recipe?.parameters.maxReminders
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
