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

import { isMoney } from '../money'
import type { Money } from '../money'
import { PREMIUM_SOURCES } from './quotation'
import type { PremiumSource } from './quotation'
import type { PremiumMode } from './premiumSchedule'
import { subAgentRequiresAgent } from './salesCredit'
import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'

export const DEAL_STATES = {
  created: 'created',
  lineItemsSet: 'line_items_set',
  consumed: 'consumed',
} as const

export type DealState = (typeof DEAL_STATES)[keyof typeof DEAL_STATES]

/**
 * What a placement check needs to know about a line, and no more.
 *
 * A policy is not a deal line and has no line id, so the commission chain used to
 * invent one in order to call the scope guard. Naming the smaller shape means it
 * does not have to: anything carrying a company, a product and a label can be
 * checked against an appointment.
 */
export type PlacementLine = {
  readonly companyId: string
  readonly productId: string
  readonly label: string
}

/**
 * One accepted column of the won quotation, carried onto the deal.
 *
 * The financial fields are the fix for a deal that used to know which company and
 * product were going forward and not what the customer had agreed to pay for
 * them. Every one of them is CARRIED, never derived: the figure was typed on the
 * quotation column, and moving a record with the record it belongs to is not the
 * same act as computing one. `quotationLineId` and `carriedFromVersion` are what
 * make that claim checkable rather than asserted — they name the line the figure
 * came from, so a reviewer can go and look.
 */
export type DealLineItem = PlacementLine & {
  readonly id: string

  /* ---- provenance: the quotation line this was carried from ---- */
  readonly quotationLineId: string
  readonly columnKey: string
  readonly carriedFromVersion: number

  /* ---- the accepted financials ---- */
  readonly acceptedFinalPayablePremium: Money
  readonly acceptedPremiumSource: PremiumSource
  /** Components stay optional forever, per §9. Never guarded on. */
  readonly netPremium: Money | null
  readonly gstAmount: Money | null
  readonly premiumMode: PremiumMode
}

/**
 * One appointment: this agency may place this product, with this company, for
 * this window, at this rate.
 *
 * The pair is the unit, and that is the whole point. Scope used to be held as a
 * set of company ids beside a set of product ids, which loses the pairing: an
 * agency appointed for (Tata AIG, Travel) and (HDFC, Motor) produced the two
 * sets {Tata AIG, HDFC} and {Travel, Motor}, and (Tata AIG, Motor) then passed a
 * check whose entire purpose was to refuse it. The error grew with every
 * appointment added.
 */
export type AppointedPlacement = {
  readonly scopeId: string
  readonly companyId: string
  readonly productId: string
  /**
   * The agency's rate for this pair, carried so FR-14 need not re-resolve it.
   * Nullable because configuration lets an appointment exist before its rate is
   * agreed, and an unset rate is a real state rather than a zero.
   */
  readonly commissionPercentBp: number | null
  readonly appointedFrom: string
  /** `null` is open-ended. An appointment that ended has a date, not a deletion. */
  readonly appointedTo: string | null
}

/** What the selected agency is actually appointed to sell. */
export type AgencyScope = {
  readonly agencyId: string
  readonly appointments: readonly AppointedPlacement[]
}

/** The shape `placementInsideAgencyScope` reads. A deal satisfies it; so does a policy. */
export type PlacementContext = {
  readonly lineItems: readonly PlacementLine[]
  readonly agencyScope?: AgencyScope
  /**
   * The date the placement is judged as of — the award date, normally. Absent
   * means the caller has no date to offer, and only the pairing is checked;
   * an appointment's window cannot be judged without knowing when.
   */
  readonly asOf?: string
}

/**
 * A scope row as every caller already holds it. Structural, so the config
 * store's nullable-rate variant and the repository's own row both satisfy it
 * without either importing the other.
 */
export type AppointmentRow = {
  readonly id: string
  readonly agencyId: string
  readonly companyId: string
  readonly productId: string
  readonly commissionPercentBp: number | null
  readonly effectiveFrom: string
  readonly effectiveTo: string | null
  readonly active: boolean
}

/**
 * The one builder, so the three places that used to flatten scope by hand
 * cannot drift apart again. Inactive rows are dropped here: a deactivated
 * appointment stops being offered the moment it is deactivated, which is a
 * different fact from one whose window has closed.
 */
export function agencyScopeFrom(
  agencyId: string,
  rows: readonly AppointmentRow[],
): AgencyScope {
  return {
    agencyId,
    appointments: rows
      .filter((row) => row.agencyId === agencyId && row.active)
      .map((row) => ({
        scopeId: row.id,
        companyId: row.companyId,
        productId: row.productId,
        commissionPercentBp: row.commissionPercentBp,
        appointedFrom: row.effectiveFrom,
        appointedTo: row.effectiveTo,
      })),
  }
}

/**
 * The companies, then the products, an agency may place as of a date.
 *
 * For populating a control, not for checking one. The guard matches pairs; these
 * flatten, and a caller that offers a product from this list without also
 * constraining the company is offering a combination the guard may refuse.
 * `appointedProductIds` therefore takes an optional company to scope to, and
 * every picker that knows the company should pass it.
 */
export function appointedCompanyIds(scope: AgencyScope, asOf?: string): readonly string[] {
  return [...new Set(liveAppointments(scope, asOf).map((row) => row.companyId))]
}

export function appointedProductIds(
  scope: AgencyScope,
  options: { readonly companyId?: string; readonly asOf?: string } = {},
): readonly string[] {
  const rows = liveAppointments(scope, options.asOf).filter(
    (row) => options.companyId === undefined || row.companyId === options.companyId,
  )
  return [...new Set(rows.map((row) => row.productId))]
}

function liveAppointments(scope: AgencyScope, asOf?: string): readonly AppointedPlacement[] {
  if (asOf === undefined) return scope.appointments
  return scope.appointments.filter(
    (row) => row.appointedFrom <= asOf && (row.appointedTo === null || row.appointedTo >= asOf),
  )
}

/** The appointment covering a company-and-product pair as of a date, if any. */
export function appointmentFor(
  scope: AgencyScope,
  line: PlacementLine,
  asOf?: string,
): AppointedPlacement | undefined {
  return scope.appointments.find((appointment) => {
    if (appointment.companyId !== line.companyId) return false
    if (appointment.productId !== line.productId) return false
    if (asOf === undefined) return true
    if (appointment.appointedFrom > asOf) return false
    return appointment.appointedTo === null || appointment.appointedTo >= asOf
  })
}

export type DealContext = {
  readonly lineItems: readonly DealLineItem[]
  readonly agencyScope?: AgencyScope
  readonly consumedByPolicyId?: string
  /** The resolved sales credit. Read by `dealSalesCreditIsWhole`. */
  readonly agentId?: string | null
  readonly subAgentId?: string | null
  /** The award this deal is being opened against. */
  readonly awardKey?: string
  /**
   * The deal that award already produced, read by the repository before the
   * machine is asked. `null` means "looked, found nothing"; `undefined` means
   * nobody looked, which is itself a refusal — a uniqueness check that silently
   * passes because it was never given the facts is worse than no check.
   */
  readonly existingDealForAwardKey?: { readonly id: string; readonly systemNo: string } | null
}

/**
 * The identity of one award: this quotation, at this version, on these columns.
 *
 * Deliberately NOT the quotation id alone. Two legitimate cases need the wider
 * key — a customer who takes two of the three quoted products, and a v1 that is
 * lost, revised to v2 and won on the new figures. A quotation-level constraint
 * would refuse both and be worked around within a week.
 *
 * The keys are sorted so the same award produces the same string whichever order
 * a person ticked the columns in.
 */
export function awardKeyFor(
  quotationId: string,
  quotationVersion: number,
  acceptedColumnKeys: readonly string[],
): string {
  return `${quotationId}:v${quotationVersion}:${[...acceptedColumnKeys].sort().join('+')}`
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
export function placementInsideAgencyScope(ctx: PlacementContext): TransitionResult {
  if (!ctx.agencyScope) {
    return refuse('Select the placing agency before setting line items. Placement is limited to that agency.')
  }

  const scope = ctx.agencyScope
  const offside = ctx.lineItems.filter((item) => !appointmentFor(scope, item, ctx.asOf))
  if (offside.length > 0) {
    const labels = offside.map((item) => item.label).join(', ')
    return refuse(
      `Agency ${scope.agencyId} is not appointed for: ${labels}. Placement offers only the companies and products inside the selected agency's scope.`,
    )
  }
  return allow()
}

/**
 * D3, applied to the carriage rather than to an entry field.
 *
 * A carried figure keeps the provenance it had on the quotation column. If that
 * provenance says `computed`, the figure was worked out by something rather than
 * read off an insurer's quote, and carrying it forward would launder a derived
 * amount into the record every downstream consumer treats as authoritative.
 */
export function carriedPremiumIsTypedNotComputed(ctx: DealContext): TransitionResult {
  const missing = ctx.lineItems.filter((item) => !isMoney(item.acceptedFinalPayablePremium))
  if (missing.length > 0) {
    const labels = missing.map((item) => item.label).join(', ')
    return refuse(
      `No accepted premium was carried across for: ${labels}. A deal takes the figure the customer agreed to from the quotation column they accepted.`,
    )
  }

  const derived = ctx.lineItems.filter(
    (item) => item.acceptedPremiumSource === PREMIUM_SOURCES.computed,
  )
  if (derived.length > 0) {
    const labels = derived.map((item) => item.label).join(', ')
    return refuse(
      `The premium carried across for ${labels} is marked as computed. This figure is typed from the insurer's quote, never derived.`,
    )
  }
  return allow()
}

/**
 * The arrangement rule, asked of a deal rather than of a bare credit.
 *
 * A thin wrapper on purpose: `subAgentRequiresAgent` states the rule once and
 * this puts it in the shape the machine's guard list wants, so the sentence a
 * person reads is the same one the commission chain would have produced.
 */
export function dealSalesCreditIsWhole(ctx: DealContext): TransitionResult {
  return subAgentRequiresAgent({
    agentId: ctx.agentId ?? null,
    subAgentId: ctx.subAgentId ?? null,
  })
}

/**
 * One sale, one application.
 *
 * Cross-record uniqueness cannot live in a guard on its own: a guard is a pure
 * function over the context it is handed, and the context has no store. So the
 * repository reads the fact and puts it in the context, exactly as it already
 * does for `agencyScope`, and the refusal stays the machine's own sentence.
 *
 * The refusal names the application that already exists. "A deal already exists"
 * without saying which one sends somebody hunting through a queue.
 */
export function dealIsUniquePerAward(ctx: DealContext): TransitionResult {
  if (ctx.awardKey === undefined) {
    return refuse('A deal is opened against an award, and no award was named. Record which columns the customer accepted first.')
  }
  if (ctx.existingDealForAwardKey === undefined) {
    return refuse('The applications already open on this award have not been read, so uniqueness cannot be checked. This is a wiring fault, not a data one.')
  }
  if (ctx.existingDealForAwardKey !== null) {
    return refuse(
      `${ctx.existingDealForAwardKey.systemNo} was already opened for these accepted columns on this version of the quotation. Open that application rather than creating a second one for one sale.`,
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
      guards: [dealHasLineItems, carriedPremiumIsTypedNotComputed, placementInsideAgencyScope],
    },
  },
  line_items_set: {
    consumed: {
      event: 'deal.consumed',
      guards: [dealHasLineItems, carriedPremiumIsTypedNotComputed, dealConsumedByPolicy],
    },
  },
} as const satisfies TransitionTable<DealState, DealContext>

export const dealMachine = createMachine<DealState, DealContext>({
  name: 'deal',
  states: Object.values(DEAL_STATES),
  initial: DEAL_STATES.created,
  transitions: DEAL_TRANSITIONS,
})
