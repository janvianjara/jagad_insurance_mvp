/**
 * Money — commission rules and the ledger. Plan §8, cluster "Money".
 *
 * The rule carries a percentage; the ledger carries an amount. They are separate
 * entities on purpose: the percentage is configuration an admin edits, and the
 * booked amount is a figure a person recorded against a placement. This layer
 * never turns the first into the second — `commission.booked` is emitted when
 * somebody books it, with the figure they typed.
 */

import type { Money } from '../../domain/money'
import type { ListQuery, Page, ReadRepository } from './query'

export type CommissionRule = {
  readonly id: string
  readonly agencyId: string
  readonly companyId: string
  readonly productId: string
  readonly basisPercentBp: number
  readonly effectiveFrom: string
  readonly effectiveTo: string | null
  readonly active: boolean
}

export const LEDGER_ENTRY_KINDS = {
  commissionBooked: 'commission_booked',
  agentShare: 'agent_share',
  subAgentShare: 'sub_agent_share',
  payout: 'payout',
} as const

export type LedgerEntryKind = (typeof LEDGER_ENTRY_KINDS)[keyof typeof LEDGER_ENTRY_KINDS]

export type LedgerEntry = {
  readonly id: string
  readonly policyId: string
  readonly agencyId: string
  readonly agentId: string | null
  readonly subAgentId: string | null
  readonly kind: LedgerEntryKind
  /** Typed when the entry was booked. Nothing here derives it from a percentage. */
  readonly amount: Money
  readonly bookedAt: string
  readonly bookedBy: string
  readonly note: string
}

export type CommissionRepository = ReadRepository<LedgerEntry> & {
  rules(agencyId: string): Promise<readonly CommissionRule[]>
  ruleFor(
    agencyId: string,
    companyId: string,
    productId: string,
  ): Promise<CommissionRule | null>
  forPolicy(policyId: string): Promise<readonly LedgerEntry[]>
  forAgent(agentId: string, query?: ListQuery): Promise<Page<LedgerEntry>>
}
