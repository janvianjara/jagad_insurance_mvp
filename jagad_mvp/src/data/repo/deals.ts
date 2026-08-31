/**
 * Demand — deals. Plan §8, canvas 2.7-2.8.
 *
 * A deal is the bridge between a won quotation and the policies it produces. The
 * two §9 rules it carries are both enforced by `dealMachine` in the adapter: a
 * deal with zero line items is blocked with a sentence a person can read, and
 * placement offers only what the selected agency is appointed for.
 */

import type { AmendCommand, Discardable, DiscardCommand, RestoreCommand } from '../../domain/amend'
import type { DealLineItem, DealState, SalesCreditSource } from '../../domain/workflows'
import type { ListQuery, Page, ReadRepository } from './query'
import type { MutationResult } from './result'

export type Deal = Discardable & {
  readonly id: string
  readonly systemNo: string
  readonly status: DealState
  readonly quotationId: string
  readonly customerId: string
  readonly ownerId: string
  readonly agentId: string | null
  readonly subAgentId: string | null
  readonly agencyId: string | null
  readonly lineItems: readonly DealLineItem[]
  /* ---- the award this application was opened against ---- */
  readonly quotationVersion: number
  readonly acceptedColumnKeys: readonly string[]
  /** Unique across live deals. `awardKeyFor` is the one place it is built. */
  readonly awardKey: string
  /** Which record the sales credit was read off, for tracing a booking later. */
  readonly salesCreditSource: SalesCreditSource | null
  readonly createdAt: string
  readonly consumedByPolicyId: string | null
}

/**
 * Opening a deal off a won quotation — canvas 2.7.
 *
 * `lineItems` is required and must not be empty. §9's "a deal with zero line
 * items is blocked with a clear message" is checked at birth by `dealHasLineItems`
 * itself, so the refusal a screen renders is the machine's own sentence rather
 * than a second wording invented here. The agency is not part of creation:
 * placement is `setLineItems`, where the scope check lives.
 */
export type CreateDealCommand = {
  readonly actorId: string
  readonly quotationId: string
  readonly quotationVersion: number
  readonly acceptedColumnKeys: readonly string[]
  readonly customerId: string
  readonly ownerId: string
  readonly lineItems: readonly DealLineItem[]
  readonly agentId?: string | null
  readonly subAgentId?: string | null
  readonly salesCreditSource?: SalesCreditSource | null
  readonly now?: Date
}

export type SetDealLineItemsCommand = {
  readonly actorId: string
  readonly agencyId: string
  readonly lineItems: readonly DealLineItem[]
  readonly now?: Date
}

export type ConsumeDealCommand = {
  readonly actorId: string
  readonly policyId: string
  readonly now?: Date
}

export type DealRepository = ReadRepository<Deal> & {
  bySystemNo(systemNo: string): Promise<Deal | null>
  forCustomer(customerId: string, query?: ListQuery): Promise<Page<Deal>>
  /** The deals opened off one quotation — the middle hop of the audit spine. */
  forQuotation(quotationId: string): Promise<readonly Deal[]>
  /** Deals that have line items and no policy yet — the policy-entry worklist. */
  awaitingPolicyEntry(query?: ListQuery): Promise<Page<Deal>>

  /**
   * The application already open on an award, if there is one. Read before every
   * create so `dealIsUniquePerAward` has the fact it needs.
   */
  byAwardKey(awardKey: string): Promise<Deal | null>

  /**
   * Opens a deal in `created`. Refuses an empty line-item list per §9, a carried
   * premium that was computed, a sub-agent with no agent, and a second
   * application on an award that already has one.
   */
  create(command: CreateDealCommand): Promise<MutationResult<Deal>>
  setLineItems(id: string, command: SetDealLineItemsCommand): Promise<MutationResult<Deal>>
  consume(id: string, command: ConsumeDealCommand): Promise<MutationResult<Deal>>

  /**
   * Corrects the attribution — `AMEND_POLICIES.Deal`, which is the agent and the
   * sub-agent and nothing else. The line items are placement and go through
   * `setLineItems`, where the agency scope check lives.
   */
  amend(id: string, command: AmendCommand): Promise<MutationResult<Deal>>
  /**
   * Removes an application opened in error. Refused once a policy has been
   * written off it: the policy's provenance points here, and a discarded rung
   * would leave the audit spine with a hole in it.
   */
  discard(id: string, command: DiscardCommand): Promise<MutationResult<Deal>>
  restore(id: string, command: RestoreCommand): Promise<MutationResult<Deal>>
}
