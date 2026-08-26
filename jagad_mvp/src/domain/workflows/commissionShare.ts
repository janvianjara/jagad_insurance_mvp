/**
 * Commission share guards - plan §9, FR-07.3a and FR-14.9, canvas n57-n59, P1.
 *
 * This module holds the two checks from §9's commission section that are guards
 * rather than arithmetic, and it holds nothing else. The distinction matters and
 * it is the whole reason this file is small:
 *
 *   A cap check is a comparison against a configured limit. That is a guard, and
 *   it belongs beside the other §9 guards, in P-03.
 *
 *   The chain itself - pay-in to agent cut to sub-agent share, and the ledger
 *   entries at every level - derives Money. That is P-16's work, and it does not
 *   grow here. The test beside this file asserts that nothing exported from this
 *   module returns a Money, so the boundary is enforced rather than remembered.
 *
 * Percentages are integer BASIS POINTS: 1 basis point is one hundredth of one
 * percent, so 12.5% is 1250 and 100% is 10000. Integers for the same reason
 * amounts are integer paise - a commission chain that splits three ways produces
 * reconciliation mismatches when the percentages are floats. Nothing here is a
 * Money value and nothing here multiplies one.
 */

import { allow, refuse } from './machine'
import type { TransitionResult } from './machine'

/** 100 basis points to the percent, 10000 to the whole. */
export const BASIS_POINTS_PER_PERCENT = 100
export const FULL_SHARE_BASIS_POINTS = 10_000

/** For refusal text only. Returns a string; it never returns a rate anybody could book against. */
export function formatPercentBp(basisPoints: number): string {
  return `${(basisPoints / BASIS_POINTS_PER_PERCENT).toFixed(2).replace(/\.00$/, '')}%`
}

export function isValidBasisPoints(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= FULL_SHARE_BASIS_POINTS
  )
}

export type CommissionShareContext = {
  /** The agent's own cut, from the Agent record. The sub-agent share is carved out of this. */
  readonly agentSharePercentBp?: number
  /** The share being proposed for the sub-agent. */
  readonly subAgentSharePercentBp?: number
  /**
   * The admin cap on a sub-agent share, when one is configured. Absent is a real
   * state and §9 is explicit about what it means: no cap set does not mean no
   * ceiling, it means the agent's own percentage is the ceiling.
   */
  readonly capPercentBp?: number
}

/**
 * §9: "A share above the configured cap is blocked; with no cap set, any share
 * within the agent's own % is accepted."
 *
 * Two ceilings, and the second one never goes away. A sub-agent share is carved
 * FROM the agent's cut, so it can never exceed it whatever the cap says - an
 * agent on 15% cannot hand a sub-agent 20% of a policy they do not hold.
 */
export function subAgentShareWithinCap(ctx: CommissionShareContext): TransitionResult {
  if (!isValidBasisPoints(ctx.agentSharePercentBp)) {
    return refuse(
      'The agent percentage is missing or out of range. A sub-agent share is carved from the agent cut, so that figure has to be known first.',
    )
  }
  if (!isValidBasisPoints(ctx.subAgentSharePercentBp)) {
    return refuse('Enter the sub-agent share as a percentage between 0 and 100.')
  }

  const agentShare = ctx.agentSharePercentBp
  const subAgentShare = ctx.subAgentSharePercentBp

  if (ctx.capPercentBp !== undefined) {
    if (!isValidBasisPoints(ctx.capPercentBp)) {
      return refuse('The configured sub-agent cap is out of range. Fix the cap in configuration before setting shares.')
    }
    if (subAgentShare > ctx.capPercentBp) {
      return refuse(
        `A sub-agent share of ${formatPercentBp(subAgentShare)} is above the configured cap of ${formatPercentBp(ctx.capPercentBp)}.`,
      )
    }
  }

  if (subAgentShare > agentShare) {
    return refuse(
      `A sub-agent share of ${formatPercentBp(subAgentShare)} is more than the agent's own ${formatPercentBp(agentShare)}. The share is carved out of the agent cut, so it can never be larger than it.`,
    )
  }

  return allow()
}

/** Who can appear on either side of a commission arrangement. */
export const COMMISSION_PARTY_KINDS = {
  company: 'company',
  broker: 'broker',
  agency: 'agency',
  agent: 'agent',
  subAgent: 'sub_agent',
} as const

export type CommissionPartyKind =
  (typeof COMMISSION_PARTY_KINDS)[keyof typeof COMMISSION_PARTY_KINDS]

export type CommissionParty = {
  readonly id: string
  readonly kind: CommissionPartyKind
  /** Whether this party holds a login. A broker never does. */
  readonly isPlatformUser?: boolean
}

export type CommissionArrangementContext = {
  readonly payer?: CommissionParty
  readonly payee?: CommissionParty
}

/**
 * §9: "A broker is a payer, never a payee and never a user."
 *
 * A broker is the vendor channel the money arrives through. Putting one on the
 * receiving side of an entry inverts the chain, and giving one a login puts an
 * outside party inside the agency's book.
 */
export function brokerIsPayerNeverPayee(ctx: CommissionArrangementContext): TransitionResult {
  const { payer, payee } = ctx

  if (!payer) return refuse('Name the payer on this commission arrangement.')
  if (!payee) return refuse('Name the payee on this commission arrangement.')

  if (payee.kind === COMMISSION_PARTY_KINDS.broker) {
    return refuse(
      `${payee.id} is a broker. A broker is a payer on this chain, never a payee - the money comes in through them, it does not go out to them.`,
    )
  }

  // A broker can only ever appear as the payer, so that is the only side where
  // "never a user" still has anything left to check.
  if (payer.kind === COMMISSION_PARTY_KINDS.broker && payer.isPlatformUser === true) {
    return refuse(`${payer.id} is a broker. A broker is never a user of this platform, only a payer into it.`)
  }

  return allow()
}
