/**
 * Channel — agencies and the scope they are appointed for. Plan §8, canvas 6.3.
 *
 * Canvas 6.3 sets the rule the deal machine enforces: "Individual locks to one
 * company; Broker allows many; placement filtered by scope." The scope is a row
 * per company and product with the commission percentage attached, which is why
 * it is a separate entity rather than an array on the agency — a percentage that
 * differs per policy cannot live on a record that has one of each.
 *
 * Percentages are basis points, matching `src/domain/workflows/commissionShare`.
 * Two and a half percent is 250, not 2.5, because a float in a three-way split is
 * how reconciliation mismatches start looking like business bugs.
 */

import type { ReadRepository } from './query'

export const AGENCY_TYPES = {
  individual: 'individual',
  broker: 'broker',
} as const

export type AgencyType = (typeof AGENCY_TYPES)[keyof typeof AGENCY_TYPES]

export type Agency = {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly type: AgencyType
  /** An Individual agency carries exactly one entry here; a Broker carries several. */
  readonly companyIds: readonly string[]
  readonly city: string
  readonly active: boolean
}

/** One appointed company-and-product line, with the rate that came with it. */
export type AgencyPolicyScope = {
  readonly id: string
  readonly agencyId: string
  readonly companyId: string
  readonly productId: string
  readonly commissionPercentBp: number
  readonly effectiveFrom: string
  readonly active: boolean
}

export type AgencyRepository = ReadRepository<Agency> & {
  byCode(code: string): Promise<Agency | null>
  scopes(agencyId: string): Promise<readonly AgencyPolicyScope[]>
  /**
   * The placement filter, in the shape `placementInsideAgencyScope` wants: the
   * company and product ids this agency may actually be placed with.
   */
  placementScope(agencyId: string): Promise<{
    readonly agencyId: string
    readonly companyIds: readonly string[]
    readonly productIds: readonly string[]
  } | null>
}
