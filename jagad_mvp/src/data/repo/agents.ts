/**
 * Channel — agents, sub-agents and their commission splits. Plan §8, canvas 6.4.
 *
 * Canvas 6.4: "Agent added: % set, sub-agent grant, cap, direct-updates toggle …
 * Agent can build his own sub-agent team within the cap." All four settings are
 * fields on the agent, and the cap is the number
 * `subAgentShareWithinCap` in `src/domain/workflows/commissionShare` reads. A
 * sub-agent is the same record with `parentAgentId` filled in, so the reporting
 * line is one field rather than a second table that can disagree with the first.
 */

import type { ReadRepository } from './query'

export type Agent = {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly mobile: string
  readonly email: string
  readonly agencyId: string
  /** Set when the agent also logs in as staff. A sub-agent in the field may not. */
  readonly userId: string | null
  /** Null for an agent; names the agent a sub-agent reports to. */
  readonly parentAgentId: string | null
  readonly city: string
  readonly categoryIds: readonly string[]
  /** This agent's own share of the commission on business they source. */
  readonly sharePercentBp: number
  /** Canvas 6.4's grant: may this agent recruit sub-agents at all. */
  readonly canGrantSubAgents: boolean
  /** The ceiling a sub-agent's share may not exceed. */
  readonly subAgentCapPercentBp: number
  /** FR-11's toggle: may this agent post claim status updates directly. */
  readonly directUpdatesEnabled: boolean
  readonly active: boolean
}

/**
 * The agreed split for one placement. Both shares are typed by whoever set the
 * arrangement up; nothing here divides anything.
 */
export type CommissionSplit = {
  readonly id: string
  readonly agencyId: string
  readonly companyId: string
  readonly productId: string
  readonly agentId: string
  readonly subAgentId: string | null
  readonly agentSharePercentBp: number
  readonly subAgentSharePercentBp: number
  readonly effectiveFrom: string
}

export type AgentRepository = ReadRepository<Agent> & {
  byCode(code: string): Promise<Agent | null>
  /** The sub-agents reporting to this agent. Drives the `includeSubAgents` scope. */
  subAgentsOf(agentId: string): Promise<readonly Agent[]>
  forAgency(agencyId: string): Promise<readonly Agent[]>
  splits(agentId: string): Promise<readonly CommissionSplit[]>
}
