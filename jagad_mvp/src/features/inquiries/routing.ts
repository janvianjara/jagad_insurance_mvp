/**
 * Routing, as arithmetic over configuration.
 *
 * Canvas 1.1 says an inquiry that arrives is "assigned to the matching person"
 * and canvas 1.3 says a lapsed one goes to "next in category". Both sentences are
 * decided here, from records an admin edits — the category and its members, and
 * the escalation recipe — and from nothing else. There is no list of people in
 * this file and no number: §9's "TAT duration is a recipe parameter, not a
 * constant" is enforced by there being nowhere here for a constant to live.
 *
 * The functions are pure and take their inputs, so the screens can preview a
 * routing decision inside a `<ConfirmGate>` before anything is written, and the
 * tests can assert the decision without rendering.
 */

import type { InquiryCategory, Recipe, StaffUser } from '../../data/repo'
import type { Inquiry } from '../../data/repo'

/** The escalation recipe's key. Its parameters are edited in configuration. */
export const ESCALATION_RECIPE_KEY = 'inquiry.escalation'
export const ROUTING_RECIPE_KEY = 'inquiry.routing'

export type RoutingPlan =
  | {
      readonly ok: true
      readonly category: InquiryCategory
      readonly assignee: StaffUser
      /** From the category. §9: a recipe parameter, never a constant. */
      readonly tatMinutes: number
    }
  | {
      readonly ok: false
      /** Written to be rendered next to the unrouted alert. */
      readonly reason: string
    }

function activeById(users: readonly StaffUser[]): Map<string, StaffUser> {
  return new Map(users.filter((user) => user.active).map((user) => [user.id, user]))
}

/**
 * The people a category may route to.
 *
 * Membership is tested twice on purpose. The category lists its members, and each
 * staff record lists the categories that person covers; requiring both is what
 * makes §9's "reassignment stays inside the same category group" true of the
 * suggestion as well as of the guard, so the screen never proposes a move the
 * machine is about to refuse.
 */
export function routableMembers(
  category: InquiryCategory,
  users: readonly StaffUser[],
): readonly StaffUser[] {
  const byId = activeById(users)
  return category.memberUserIds
    .map((id) => byId.get(id))
    .filter((user): user is StaffUser => user !== undefined && user.categoryIds.includes(category.id))
}

/** Everyone who has already held this inquiry, current holder included. */
export function priorHolders(inquiry: Inquiry): readonly string[] {
  const held = inquiry.assignmentHistory.map((entry) => entry.assigneeId)
  return inquiry.ownerId === null ? held : [...held, inquiry.ownerId]
}

export function categoryOf(
  inquiry: Inquiry,
  categories: readonly InquiryCategory[],
): InquiryCategory | null {
  if (inquiry.categoryId === null) return null
  return categories.find((category) => category.id === inquiry.categoryId) ?? null
}

/**
 * Who this inquiry goes to next, and under what allowance.
 *
 * A refusal is the input to canvas 1.5 rather than an error: routing that cannot
 * resolve produces a sentence, the screen shows it, and the inquiry moves to
 * `unrouted` with the admin alert. Nothing is dropped and nothing is guessed.
 */
export function planRouting(
  inquiry: Inquiry,
  categories: readonly InquiryCategory[],
  users: readonly StaffUser[],
): RoutingPlan {
  const category = categoryOf(inquiry, categories)
  if (!category) {
    return {
      ok: false,
      reason:
        'No category matches this inquiry, so routing has nobody to hand it to. It goes to the unrouted queue with an admin alert rather than to a queue nobody owns.',
    }
  }

  const members = routableMembers(category, users)
  if (members.length === 0) {
    return {
      ok: false,
      reason: `Nobody active covers ${category.label}. Add a member to the category in configuration, or route this inquiry by hand.`,
    }
  }

  const held = new Set(priorHolders(inquiry))
  // Next in the group means the first member who has not had it yet. When
  // everyone has, it goes back round to whoever is not holding it now — the
  // group never widens, which is exactly what §9 asks for.
  const fresh = members.filter((member) => !held.has(member.id))
  const rotation = fresh.length > 0 ? fresh : members.filter((member) => member.id !== inquiry.ownerId)
  const assignee = rotation[0]

  if (!assignee) {
    return {
      ok: false,
      reason: `${category.label} has only one person on it and they already hold this inquiry. Reassignment stays inside the category group, so this one needs a person added to the category or an escalation.`,
    }
  }

  return { ok: true, category, assignee, tatMinutes: category.tatMinutes }
}

export type EscalationPlan =
  | { readonly ok: true; readonly toUserId: string; readonly recipe: Recipe }
  | { readonly ok: false; readonly reason: string }

/** Where a twice-lapsed inquiry goes. The manager is named by the recipe, not here. */
export function planEscalation(recipes: readonly Recipe[]): EscalationPlan {
  const recipe = recipes.find((entry) => entry.key === ESCALATION_RECIPE_KEY && entry.active)
  if (!recipe) {
    return {
      ok: false,
      reason: `No active "${ESCALATION_RECIPE_KEY}" recipe is configured, so there is nobody to escalate to. Configure it before escalating.`,
    }
  }

  const target = recipe.parameters.escalateToUserId
  if (typeof target !== 'string' || target.trim() === '') {
    return {
      ok: false,
      reason: `The "${ESCALATION_RECIPE_KEY}" recipe names no escalation recipient. Set one in configuration.`,
    }
  }

  return { ok: true, toUserId: target, recipe }
}

/**
 * The allowance this inquiry is measured against, in minutes.
 *
 * Null rather than a fallback. A clock rendered against a guessed allowance is a
 * number the business would start running on, and §9 says this platform holds no
 * default.
 */
export function tatMinutesFor(
  inquiry: Inquiry,
  categories: readonly InquiryCategory[],
): number | null {
  const category = categoryOf(inquiry, categories)
  return category ? category.tatMinutes : null
}

export function nameOf(users: readonly StaffUser[], id: string | null | undefined): string {
  if (!id) return 'Unassigned'
  return users.find((user) => user.id === id)?.name ?? id
}
