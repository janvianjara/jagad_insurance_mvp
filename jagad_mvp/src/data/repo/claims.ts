/**
 * Claims — seeded in M0, screened in P2. Plan §8 ("P2 adds"), canvas flow 4.
 *
 * The claim screens are P2 work, but the story cast carries CLM-0412 and its
 * siblings from the prototype walkthrough, so the records have to exist now: a
 * customer detail page built in M0 shows a claims section, and a fixture set that
 * cannot answer "what claims does Rakesh Patel have" would have to be rebuilt.
 *
 * The repository is therefore read plus one machine-routed move. Everything the
 * flow-4 rows need — the blocked-on-lapsed-policy path, the cashless upload link,
 * the settlement figure typed from the insurer's advice — is already expressed by
 * `claimMachine`, so P2 adds screens rather than rules.
 */

import type { Money } from '../../domain/money'
import type { ClaimState, ClaimType, SettlementSource } from '../../domain/workflows'
import type { ListQuery, Page, ReadRepository } from './query'
import type { MutationResult } from './result'

/**
 * The settlement, as recorded. `source` may only be the insurer's advice — a
 * derived figure is refused by `settlementTypedFromInsurerAdvice`, which is why
 * the reference is stored beside the amount.
 */
export type ClaimSettlement = {
  readonly amount: Money | null
  readonly deduction: Money | null
  readonly source: SettlementSource | null
  readonly insurerAdviceRef: string | null
}

export type Claim = {
  readonly id: string
  readonly systemNo: string
  readonly insurerNo: string | null
  readonly policyId: string
  readonly customerId: string
  readonly memberId: string | null
  readonly claimType: ClaimType
  readonly state: ClaimState
  readonly ownerId: string | null
  readonly agentId: string | null
  readonly raisedAt: string
  readonly intimatedAt: string | null
  readonly settlement: ClaimSettlement
  readonly companyRemark: string | null
  readonly documentIds: readonly string[]
  readonly checklistItems: readonly string[]
  readonly documentsCollected: readonly string[]
}

/**
 * The facts a claim move needs. Which of them matter depends on the edge — the
 * machine's guards decide, and a missing one comes back as its sentence rather
 * than as a silent no-op.
 */
export type ClaimTransitionCommand = {
  readonly actorId: string
  readonly policyActive?: boolean
  readonly policyStatus?: string
  readonly agentNotified?: boolean
  readonly settlement?: ClaimSettlement
  readonly companyRemark?: string
  readonly documentsCollected?: readonly string[]
  readonly now?: Date
}

export type ClaimRepository = ReadRepository<Claim> & {
  bySystemNo(systemNo: string): Promise<Claim | null>
  forPolicy(policyId: string): Promise<readonly Claim[]>
  forCustomer(customerId: string): Promise<readonly Claim[]>
  queue(query?: ListQuery): Promise<Page<Claim>>
  /**
   * Claims that occurred inside a policy period. Cancellation refund eligibility
   * (canvas 7.3) is decided on this, so it is a read the endorsement flow shares.
   */
  inPeriod(policyId: string, from: string, to: string): Promise<readonly Claim[]>

  advance(
    id: string,
    to: ClaimState,
    command: ClaimTransitionCommand,
  ): Promise<MutationResult<Claim>>
}
