/**
 * Inquiry — plan §9, FR-06.3, canvas n1-n8, M0.
 *
 *   new -> assigned -+- confirmed within TAT -> accepted (owner set, clock stops)
 *                    +- TAT elapsed          -> reassigned (next in category group)
 *                    +- no category match    -> unrouted (admin alert)
 *   reassigned -- TAT elapsed again -> escalated
 *   accepted -> converted (quotation opens) | lost
 *
 * The three §9 bullets are the whole point of this module: reassignment stays
 * inside the category group, escalation carries the full assignment history, and
 * unrouted is a state somebody can see rather than a queue nothing came out of.
 */

import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'

export const INQUIRY_STATES = {
  new: 'new',
  assigned: 'assigned',
  accepted: 'accepted',
  reassigned: 'reassigned',
  unrouted: 'unrouted',
  escalated: 'escalated',
  converted: 'converted',
  lost: 'lost',
} as const

export type InquiryState = (typeof INQUIRY_STATES)[keyof typeof INQUIRY_STATES]

/** One line of the assignment trail. Escalation reads all of these, not just the last. */
export type InquiryAssignment = {
  readonly assigneeId: string
  readonly assignedAt: string
  readonly releasedAt?: string
  readonly reason?: string
}

export type InquiryContext = {
  readonly now: Date
  /** When the current holder received it. The TAT clock starts here. */
  readonly assignedAt?: string
  /**
   * TAT in minutes, supplied by the recipe that routed this inquiry. §9: "TAT
   * duration is a recipe parameter, not a constant" — there is deliberately no
   * default in this module, so an omitted parameter refuses loudly instead of
   * quietly applying somebody's guess.
   */
  readonly tatMinutes?: number
  readonly confirmedAt?: string
  /** The category group the current holder belongs to. */
  readonly categoryGroupId?: string
  /** The category group of the person the inquiry is about to move to. */
  readonly nextOwnerCategoryGroupId?: string
  readonly nextOwnerId?: string
  /** Every holder so far, oldest first. */
  readonly assignmentHistory?: readonly InquiryAssignment[]
  /** True when routing found a team for the inquiry's category. */
  readonly routingMatchFound?: boolean
  /** Set by the recipe that raises the admin alert on an unrouted inquiry. */
  readonly adminAlertRaised?: boolean
  readonly lostReason?: string
}

/** The moment the TAT clock runs out. Pure, so a screen can render the countdown. */
export function tatDeadline(assignedAt: string, tatMinutes: number): Date {
  return new Date(new Date(assignedAt).getTime() + tatMinutes * 60_000)
}

function tatState(ctx: InquiryContext): { ok: false; reason: string } | { ok: true; deadline: Date } {
  if (!ctx.assignedAt) {
    return { ok: false, reason: 'This inquiry has no assignment time, so the TAT clock never started.' }
  }
  if (typeof ctx.tatMinutes !== 'number' || !Number.isFinite(ctx.tatMinutes) || ctx.tatMinutes <= 0) {
    return {
      ok: false,
      reason:
        'No TAT was supplied for this inquiry. TAT is a routing-recipe parameter and this module holds no default.',
    }
  }
  return { ok: true, deadline: tatDeadline(ctx.assignedAt, ctx.tatMinutes) }
}

export function confirmedWithinTat(ctx: InquiryContext): TransitionResult {
  const clock = tatState(ctx)
  if (!clock.ok) return refuse(clock.reason)

  if (!ctx.confirmedAt) {
    return refuse('The assignee has not confirmed this inquiry yet, so it cannot be accepted.')
  }
  if (new Date(ctx.confirmedAt) > clock.deadline) {
    return refuse(
      `Confirmation came after the TAT deadline (${clock.deadline.toISOString()}). This inquiry reassigns instead of accepting.`,
    )
  }
  return allow()
}

export function tatElapsed(ctx: InquiryContext): TransitionResult {
  const clock = tatState(ctx)
  if (!clock.ok) return refuse(clock.reason)

  if (ctx.now <= clock.deadline) {
    return refuse(
      `The TAT has not elapsed yet — it runs until ${clock.deadline.toISOString()}. The current assignee still owns this inquiry.`,
    )
  }
  return allow()
}

/**
 * §9: "Reassignment stays inside the same category group." A health inquiry does
 * not land on the motor desk because the health desk was slow.
 */
export function reassignmentStaysInCategoryGroup(
  ctx: InquiryContext,
): TransitionResult {
  if (!ctx.categoryGroupId) {
    return refuse('This inquiry has no category group, so there is no group to reassign inside.')
  }
  if (!ctx.nextOwnerId || !ctx.nextOwnerCategoryGroupId) {
    return refuse('Pick the next assignee before reassigning.')
  }
  if (ctx.nextOwnerCategoryGroupId !== ctx.categoryGroupId) {
    return refuse(
      `Reassignment stays inside the category group. This inquiry is in "${ctx.categoryGroupId}" and ${ctx.nextOwnerId} is in "${ctx.nextOwnerCategoryGroupId}".`,
    )
  }
  return allow()
}

/**
 * §9: "escalation carries the full assignment history, not just the item." The
 * manager receiving the escalation needs to see that it sat with three people for
 * six hours, not that it is currently with the third.
 */
export function escalationCarriesFullAssignmentHistory(
  ctx: InquiryContext,
): TransitionResult {
  const history = ctx.assignmentHistory ?? []
  if (history.length === 0) {
    return refuse('Escalation must carry the assignment history and this inquiry has none recorded.')
  }
  if (history.length < 2) {
    return refuse(
      'Escalation follows a reassignment, so the history must hold at least the original and the reassigned holder. Only one entry is present.',
    )
  }
  const incomplete = history.filter((entry) => !entry.assigneeId || !entry.assignedAt)
  if (incomplete.length > 0) {
    return refuse(
      `${incomplete.length} assignment entries are missing an assignee or a timestamp. Escalation carries the full trail, not a partial one.`,
    )
  }
  return allow()
}

/**
 * §9: "Unrouted is a visible state with an alert, never a silent drop." The alert
 * is part of the transition, not a nice-to-have that a later recipe might add.
 */
export function unroutedRaisesAdminAlert(ctx: InquiryContext): TransitionResult {
  if (ctx.routingMatchFound === true) {
    return refuse('Routing found a category match, so this inquiry is assignable and must not go unrouted.')
  }
  if (ctx.adminAlertRaised !== true) {
    return refuse(
      'An unrouted inquiry must raise the admin alert as part of the same move. Without the alert it is a silent drop.',
    )
  }
  return allow()
}

export function routingMatchFound(ctx: InquiryContext): TransitionResult {
  if (ctx.routingMatchFound !== true) {
    return refuse(
      'No team matches this inquiry category. It goes to unrouted with an admin alert rather than to a queue nobody owns.',
    )
  }
  if (!ctx.nextOwnerId) {
    return refuse('Pick an assignee before assigning this inquiry.')
  }
  return allow()
}

export function inquiryLostRequiresReason(ctx: InquiryContext): TransitionResult {
  if (!ctx.lostReason || ctx.lostReason.trim().length === 0) {
    return refuse('Record why this inquiry was lost. The reason is what makes lost-reason reporting worth reading.')
  }
  return allow()
}

export const INQUIRY_TRANSITIONS = {
  new: {
    assigned: {
      event: 'inquiry.assigned',
      guards: [routingMatchFound],
      note: 'Routing matched a category group and picked the next owner.',
    },
    unrouted: {
      event: 'inquiry.unrouted',
      guards: [unroutedRaisesAdminAlert],
      note: '§9: no category match -> unrouted, with the admin alert.',
    },
  },
  assigned: {
    accepted: {
      event: 'inquiry.accepted',
      guards: [confirmedWithinTat],
      note: '§9: confirmed within TAT -> accepted, owner set, clock stops.',
    },
    reassigned: {
      event: 'inquiry.reassigned',
      guards: [tatElapsed, reassignmentStaysInCategoryGroup],
      note: '§9: TAT elapsed -> next in the same category group.',
    },
    unrouted: {
      event: 'inquiry.unrouted',
      guards: [unroutedRaisesAdminAlert],
      note: 'The assignee turned out not to cover the category after all.',
    },
  },
  reassigned: {
    accepted: {
      event: 'inquiry.accepted',
      guards: [confirmedWithinTat],
    },
    escalated: {
      event: 'inquiry.escalated',
      guards: [tatElapsed, escalationCarriesFullAssignmentHistory],
      note: '§9: TAT elapsed again -> escalated, carrying the whole trail.',
    },
  },
  unrouted: {
    assigned: {
      event: 'inquiry.assigned',
      guards: [routingMatchFound],
      note: 'An admin routed it by hand. Unrouted is a waiting room, not a bin.',
    },
  },
  accepted: {
    converted: { event: 'inquiry.converted', note: 'A quotation opens from here.' },
    lost: { event: 'inquiry.lost', guards: [inquiryLostRequiresReason] },
  },
} as const satisfies TransitionTable<InquiryState, InquiryContext>

export const inquiryMachine = createMachine<InquiryState, InquiryContext>({
  name: 'inquiry',
  states: Object.values(INQUIRY_STATES),
  initial: INQUIRY_STATES.new,
  transitions: INQUIRY_TRANSITIONS,
})

export const { canTransition: canTransitionInquiry } = inquiryMachine
