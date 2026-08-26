/**
 * Deal — plan §9, FR-06.11, canvas n16-n25, M0.
 *
 *   created -> line_items_set -> consumed
 *
 * A Deal is the bridge between a won quotation and the policies that come out of
 * it. Two §9 rules live here: a deal with zero line items is blocked with a clear
 * message, and placement offers only the companies and products inside the
 * selected agency's scope.
 */

import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'

export const DEAL_STATES = {
  created: 'created',
  lineItemsSet: 'line_items_set',
  consumed: 'consumed',
} as const

export type DealState = (typeof DEAL_STATES)[keyof typeof DEAL_STATES]

export type DealLineItem = {
  readonly id: string
  readonly companyId: string
  readonly productId: string
  readonly label: string
}

/** What the selected agency is actually appointed to sell. */
export type AgencyScope = {
  readonly agencyId: string
  readonly companyIds: readonly string[]
  readonly productIds: readonly string[]
}

export type DealContext = {
  readonly lineItems: readonly DealLineItem[]
  readonly agencyScope?: AgencyScope
  readonly consumedByPolicyId?: string
}

/**
 * §9: "A deal with zero line items is blocked with a clear message." The message
 * is the requirement — a greyed-out button with no explanation fails this bullet.
 */
export function dealHasLineItems(ctx: DealContext): TransitionResult {
  if (ctx.lineItems.length === 0) {
    return refuse(
      'This deal has no line items. Add at least one company and product from the won quotation before taking it forward.',
    )
  }
  return allow()
}

/** §9: "Placement offers only companies and products inside the selected agency's scope." */
export function placementInsideAgencyScope(ctx: DealContext): TransitionResult {
  if (!ctx.agencyScope) {
    return refuse('Select the placing agency before setting line items. Placement is limited to that agency.')
  }

  const { agencyId, companyIds, productIds } = ctx.agencyScope
  const offside = ctx.lineItems.filter(
    (item) => !companyIds.includes(item.companyId) || !productIds.includes(item.productId),
  )
  if (offside.length > 0) {
    const labels = offside.map((item) => item.label).join(', ')
    return refuse(
      `Agency ${agencyId} is not appointed for: ${labels}. Placement offers only the companies and products inside the selected agency's scope.`,
    )
  }
  return allow()
}

export function dealConsumedByPolicy(ctx: DealContext): TransitionResult {
  if (!ctx.consumedByPolicyId) {
    return refuse('A deal is consumed by the policy it produced. Create the policy first.')
  }
  return allow()
}

export const DEAL_TRANSITIONS = {
  created: {
    line_items_set: {
      event: 'deal.line_items_set',
      guards: [dealHasLineItems, placementInsideAgencyScope],
    },
  },
  line_items_set: {
    consumed: {
      event: 'deal.consumed',
      guards: [dealHasLineItems, dealConsumedByPolicy],
    },
  },
} as const satisfies TransitionTable<DealState, DealContext>

export const dealMachine = createMachine<DealState, DealContext>({
  name: 'deal',
  states: Object.values(DEAL_STATES),
  initial: DEAL_STATES.created,
  transitions: DEAL_TRANSITIONS,
})
