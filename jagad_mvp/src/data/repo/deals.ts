/**
 * Demand — deals. Plan §8, canvas 2.7-2.8.
 *
 * A deal is the bridge between a won quotation and the policies it produces. The
 * two §9 rules it carries are both enforced by `dealMachine` in the adapter: a
 * deal with zero line items is blocked with a sentence a person can read, and
 * placement offers only what the selected agency is appointed for.
 */

import type { DealLineItem, DealState } from '../../domain/workflows'
import type { ListQuery, Page, ReadRepository } from './query'
import type { MutationResult } from './result'

export type Deal = {
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
  readonly createdAt: string
  readonly consumedByPolicyId: string | null
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
  /** Deals that have line items and no policy yet — the policy-entry worklist. */
  awaitingPolicyEntry(query?: ListQuery): Promise<Page<Deal>>

  setLineItems(id: string, command: SetDealLineItemsCommand): Promise<MutationResult<Deal>>
  consume(id: string, command: ConsumeDealCommand): Promise<MutationResult<Deal>>
}
