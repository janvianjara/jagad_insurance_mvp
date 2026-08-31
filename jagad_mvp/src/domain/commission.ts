/**
 * The commission chain - plan §9 "Commission chain", FR-07.3a and FR-14.9,
 * canvas n57-n59, P1.
 *
 * ---------------------------------------------------------------------------
 * Why this module is allowed to multiply money, and why nothing else is
 * ---------------------------------------------------------------------------
 *
 * `src/domain/money.ts` deliberately ships no multiply, no divide and no
 * percentage: those are how a platform *computes* money, and D3 says this one
 * *records* it. A premium, a settlement, a refund and an endorsement delta all
 * arrive typed from the insurer, and the only arithmetic the product allows on
 * them is addition.
 *
 * The commission chain is the single exception, and it is an exception by
 * requirement rather than by convenience. FR-07.3a makes the chain a calculation
 * the platform owns: the percentages are the agency's own configuration, the
 * agent's own arrangement and the admin's own cap - all of them entered here, by
 * Jagad, about Jagad's own money. Nobody outside the agency states these figures,
 * so there is nothing to record and no external figure to defer to. Deriving them
 * is the only way they can exist at all.
 *
 * That exception is bounded by three rules this module keeps:
 *
 *   1. The proportion primitive (`proportionOf`) lives here and is NOT exported
 *      from `src/domain/money`. A module that wants to multiply an amount has to
 *      import it from the commission chain, which makes the intent obvious in the
 *      import list and impossible to do by accident.
 *   2. It only ever multiplies by an integer basis-point rate that came from
 *      configuration. It never takes a rate from a form, an insurer document or a
 *      user.
 *   3. It never touches the basis. The premium the chain is reckoned on is handed
 *      in already typed; this module divides Jagad's own commission and nothing
 *      else.
 *
 * ---------------------------------------------------------------------------
 * Exactness, and who absorbs the rounding remainder
 * ---------------------------------------------------------------------------
 *
 * Everything is integer paise and integer basis points, so `paise x bp` is an
 * exact integer and the only lossy step is the final division by 10000.
 * `proportionOf` performs that division with integer arithmetic only
 * (`(n - n % 10000) / 10000`), which is exact for any safe integer `n` - a
 * float never appears, so there is no drift to accumulate.
 *
 * The division truncates TOWARD ZERO, which makes the chain sign-symmetric:
 * `chain(-x)` is exactly `-chain(x)`. That matters for the endorsement delta,
 * where a change that exactly reverses an earlier one must net the ledger to
 * zero rather than leave a paisa behind.
 *
 * **The agency - Jagad itself - absorbs the remainder.** The two outward payees
 * are each computed straight from the pay-in by truncation, and the agency then
 * takes whatever is left:
 *
 *     subAgentShare = trunc(payIn x subBp / 10000)
 *     agentNet      = trunc(payIn x (agentBp - subBp) / 10000)
 *     netProfit     = payIn - agentNet - subAgentShare        <- the residual
 *
 * Two consequences, and both are the reason for the choice:
 *
 *   - The parts sum to the pay-in EXACTLY, by definition rather than by luck.
 *     `netProfit` is not computed from a percentage at all; it is what is left.
 *     No paisa can be lost and none can be invented.
 *   - No outward payee is ever paid more than their exact entitlement, and none
 *     is short by more than one paisa. The only party that ever absorbs a
 *     sub-paisa difference is the one that owns the arrangement, does the
 *     booking and can see the whole ledger. Rounding in a partner's favour would
 *     mean paying out more than came in; rounding against them silently would be
 *     a partner's money going missing in a system they cannot inspect. Neither
 *     is acceptable, and the residual has to land somewhere.
 *
 * The agent's gross cut is the sum of its two children (`agentNet +
 * subAgentShare`) rather than a third truncation, so "the sub-agent share is
 * carved from the agent's own cut" is literally true in paise.
 *
 * ---------------------------------------------------------------------------
 * What is NOT here
 * ---------------------------------------------------------------------------
 *
 * The two guards - the sub-agent cap and "a broker is a payer, never a payee" -
 * belong to P-03 and live in `./workflows/commissionShare`. A cap check is a
 * comparison, not a computation. This module calls them; it does not restate
 * them. The Individual-agency lock is `placementInsideAgencyScope` in
 * `./workflows/deal`, and is called here for the same reason.
 */

import { fromPaise, isMoney } from './money'
import type { Money } from './money'
import { placementInsideAgencyScope } from './workflows/deal'
import type { AgencyScope, PlacementLine } from './workflows/deal'
import {
  COMMISSION_PARTY_KINDS,
  FULL_SHARE_BASIS_POINTS,
  brokerIsPayerNeverPayee,
  formatPercentBp,
  isValidBasisPoints,
  subAgentShareWithinCap,
} from './workflows/commissionShare'
import type { CommissionParty } from './workflows/commissionShare'
import { refuse } from './workflows/machine'
import type { Refused } from './workflows/machine'

/* ------------------------------------------------------------ the primitive */

/**
 * An exact proportion of an amount, in integer paise.
 *
 * The one place in the codebase where money is multiplied. `basisPoints` is an
 * integer rate from configuration: 15% is 1500, 100% is 10000.
 *
 * Exact by construction. `paise * basisPoints` is an integer, and the division
 * that follows removes the remainder with integer operations before dividing, so
 * the quotient is representable and no float rounding takes place. `%` in JS
 * takes the sign of its left operand, which is what makes the truncation go
 * toward zero on negative amounts as well as positive ones.
 */
export function proportionOf(amount: Money, basisPoints: number): Money {
  if (!isValidBasisPoints(basisPoints)) {
    throw new RangeError(
      `A commission rate must be integer basis points between 0 and ${FULL_SHARE_BASIS_POINTS}, received ${basisPoints}.`,
    )
  }

  const numerator = amount.paise * basisPoints
  if (!Number.isSafeInteger(numerator)) {
    throw new RangeError(
      `Applying ${formatPercentBp(basisPoints)} to ${amount.paise} paise overflows exact integer arithmetic.`,
    )
  }

  const remainder = numerator % FULL_SHARE_BASIS_POINTS
  return fromPaise((numerator - remainder) / FULL_SHARE_BASIS_POINTS, amount.currency)
}

/* --------------------------------------------------------------- the inputs */

/** §9's trigger list. The last two are P2; the chain shape is the same for all three. */
export const COMMISSION_TRIGGERS = {
  policyIssued: 'policy.issued',
  renewalCompleted: 'renewal.completed',
  endorsementApproved: 'endorsement.approved',
} as const

export type CommissionTrigger =
  (typeof COMMISSION_TRIGGERS)[keyof typeof COMMISSION_TRIGGERS]

/** The slug that makes a ledger id readable and stable per trigger. */
const TRIGGER_SLUGS: Readonly<Record<CommissionTrigger, string>> = {
  'policy.issued': 'issue',
  'renewal.completed': 'renewal',
  'endorsement.approved': 'endorsement',
}

/**
 * §9's payer fork: "company on own code | broker as vendor channel".
 *
 * The channel is also the grouping the ledger view totals by, because it is the
 * question an owner actually asks of a commission book - how much came in on our
 * own appointments against how much came in through somebody else's.
 */
export const COMMISSION_CHANNELS = {
  /** Placed on the agency's own appointment. The insurance company pays. */
  ownCode: 'own_code',
  /** Placed through a broking code. The broker pays, and is never paid. */
  brokerChannel: 'broker_channel',
} as const

export type CommissionChannel =
  (typeof COMMISSION_CHANNELS)[keyof typeof COMMISSION_CHANNELS]

/**
 * The only party kinds the chain will ever put on the receiving side.
 *
 * `broker` is absent, and the absence is the point: §9's "a broker is a payer,
 * never a payee" is structural here rather than checked, because there is no
 * code path that constructs a broker payee. The guard in
 * `./workflows/commissionShare` is still run against every payee below, so the
 * day somebody adds one, it refuses instead of booking.
 */
export const COMMISSION_PARTY_KINDS_IN_CHAIN = [
  COMMISSION_PARTY_KINDS.agency,
  COMMISSION_PARTY_KINDS.agent,
  COMMISSION_PARTY_KINDS.subAgent,
] as const

/** The kinds the chain writes. Three of the four in `LedgerEntryKind` (§8). */
export const COMMISSION_ENTRY_KINDS = {
  commissionBooked: 'commission_booked',
  agentShare: 'agent_share',
  subAgentShare: 'sub_agent_share',
} as const

export type CommissionEntryKind =
  (typeof COMMISSION_ENTRY_KINDS)[keyof typeof COMMISSION_ENTRY_KINDS]

/**
 * One booked row. Structurally the `LedgerEntry` of `src/data/repo/commission`,
 * restated here because `src/domain` may not import from `src/data` - the data
 * layer already depends on this one. `commission-desk.ts` assigns these entries
 * into a `readonly LedgerEntry[]`, so the compiler is what keeps the two in step.
 */
export type CommissionLedgerEntry = {
  readonly id: string
  readonly policyId: string
  readonly agencyId: string
  readonly agentId: string | null
  readonly subAgentId: string | null
  readonly kind: CommissionEntryKind
  readonly amount: Money
  readonly bookedAt: string
  readonly bookedBy: string
  readonly note: string
}

/** An agent or sub-agent on the arrangement, with their configured percentage. */
export type CommissionShareholder = {
  readonly id: string
  /** Basis points OF THE PAY-IN, not of the agent's cut. §9 compares the two directly. */
  readonly sharePercentBp: number
}

/**
 * The placement being booked, in the shape `placementInsideAgencyScope` reads
 * less the deal line's own id - a policy is not a deal line, and inventing an id
 * for one would put a second identity on a record that already has two (§8).
 */
export type CommissionPlacement = PlacementLine

export type CommissionChainInput = {
  readonly trigger: CommissionTrigger
  readonly policyId: string
  /**
   * The typed premium figure the arrangement is reckoned on - net or final, as
   * the appointment states. Nothing here derives it, and nothing here may.
   */
  readonly basis: Money
  readonly channel: CommissionChannel
  /** The company on an own-code placement, the broker on a broker channel. */
  readonly payer: CommissionParty
  /** What is being placed. The scope guard reads it; it needs no id of its own. */
  readonly placement: CommissionPlacement
  /** The appointed scope. An Individual agency's list holds exactly one company. */
  readonly agencyScope: AgencyScope
  /** The agency's rate for this company x policy, from the Agency record. */
  readonly agencyPercentBp: number
  readonly agent?: CommissionShareholder | null
  readonly subAgent?: CommissionShareholder | null
  /** The admin cap on a sub-agent share. Absent means the agent's own % is the ceiling. */
  readonly capPercentBp?: number
  /** The act of recording. The domain holds no clock and no session. */
  readonly bookedAt: string
  readonly bookedBy: string
  /** Distinguishes repeat bookings on one policy - an endorsement number, say. */
  readonly occurrence?: string
}

/* -------------------------------------------------------------- the outcome */

export type CommissionChain = {
  readonly trigger: CommissionTrigger
  readonly policyId: string
  readonly channel: CommissionChannel
  readonly payer: CommissionParty
  /** Everyone on the receiving side. None of them is ever a broker. */
  readonly payees: readonly CommissionParty[]
  readonly agencyId: string
  readonly agentId: string | null
  readonly subAgentId: string | null

  readonly basis: Money
  readonly agencyPercentBp: number
  readonly agentPercentBp: number
  readonly subAgentPercentBp: number

  /** What the payer owes the agency on this placement. */
  readonly payIn: Money
  /** The agent's cut before the sub-agent share is carved out. `agentNet + subAgentShare`. */
  readonly agentCut: Money
  /** What the agent keeps once the sub-agent share is carved out of the cut. */
  readonly agentNet: Money
  readonly subAgentShare: Money
  /** What the agency keeps, and the party that absorbs the rounding remainder. */
  readonly netProfit: Money

  readonly entries: readonly CommissionLedgerEntry[]
}

export type CommissionChainResult =
  | { readonly ok: true; readonly chain: CommissionChain }
  | Refused

/**
 * The invariant, stated as a function so the view can render it and the tests can
 * assert it: the three parts sum to the pay-in, exactly.
 *
 * True by construction - `netProfit` is the residual - which is precisely why it
 * is worth checking rather than trusting. If it ever fails, somebody has replaced
 * the residual with a fourth percentage.
 */
export function chainReconciles(chain: CommissionChain): boolean {
  return (
    chain.netProfit.paise + chain.agentNet.paise + chain.subAgentShare.paise ===
    chain.payIn.paise
  )
}

/* ---------------------------------------------------------------- the chain */

function payerFitsChannel(input: CommissionChainInput): Refused | null {
  const { channel, payer } = input

  if (channel === COMMISSION_CHANNELS.ownCode && payer.kind !== COMMISSION_PARTY_KINDS.company) {
    return refuse(
      'Business placed on an own code is paid by the insurance company. Name the company as the payer, or record this placement on a broker channel.',
    )
  }
  if (
    channel === COMMISSION_CHANNELS.brokerChannel &&
    payer.kind !== COMMISSION_PARTY_KINDS.broker
  ) {
    return refuse(
      'Business placed through a broking code is paid by the broker. Name the broker as the payer, or record this placement on an own code.',
    )
  }
  return null
}

/**
 * Computes the chain for one booking, or refuses with a sentence a person can act
 * on. Pure: no clock, no ids from a counter, no repository, no event bus. The
 * caller records the result.
 *
 * The order of checks is the order a person would ask them in - is this placement
 * even ours, are the parties the right way round, are the percentages real - so
 * the first refusal is the most useful one.
 */
export function commissionChain(input: CommissionChainInput): CommissionChainResult {
  const {
    trigger,
    policyId,
    basis,
    channel,
    payer,
    placement,
    agencyScope,
    agencyPercentBp,
    agent = null,
    subAgent = null,
    capPercentBp,
    bookedAt,
    bookedBy,
    occurrence,
  } = input

  if (!isMoney(basis)) {
    return refuse(
      'The premium this commission is reckoned on has not been recorded yet. The chain is worked out from a typed figure, never from an estimate.',
    )
  }

  /*
   * The Individual lock, and it is not restated here: canvas 6.3's rule is that
   * an Individual agency is appointed for exactly one company, which makes its
   * scope a one-company list, which is what this guard already reads. A policy on
   * any other company falls outside and is refused with the guard's own words.
   */
  const inScope = placementInsideAgencyScope({ lineItems: [placement], agencyScope })
  if (!inScope.ok) return inScope

  const channelMismatch = payerFitsChannel(input)
  if (channelMismatch) return channelMismatch

  if (!isValidBasisPoints(agencyPercentBp)) {
    return refuse(
      `No commission rate is configured for this company and policy on agency ${agencyScope.agencyId}. Set the percentage on the agency's scope before booking.`,
    )
  }

  if (subAgent && !agent) {
    return refuse(
      'A sub-agent share is carved from the agent cut, so the chain needs the agent it is carved from. Name the agent on this placement first.',
    )
  }

  if (agent && !isValidBasisPoints(agent.sharePercentBp)) {
    return refuse(
      `The percentage on agent ${agent.id} is missing or out of range. Fix it in configuration before booking commission.`,
    )
  }

  if (subAgent) {
    const withinCap = subAgentShareWithinCap({
      agentSharePercentBp: agent?.sharePercentBp,
      subAgentSharePercentBp: subAgent.sharePercentBp,
      capPercentBp,
    })
    if (!withinCap.ok) return withinCap
  }

  const agencyId = agencyScope.agencyId
  const [agencyKind, agentKind, subAgentKind] = COMMISSION_PARTY_KINDS_IN_CHAIN
  const payees: CommissionParty[] = [
    { id: agencyId, kind: agencyKind, isPlatformUser: true },
  ]
  if (agent) {
    payees.push({ id: agent.id, kind: agentKind, isPlatformUser: true })
  }
  if (subAgent) {
    payees.push({ id: subAgent.id, kind: subAgentKind, isPlatformUser: true })
  }

  /*
   * §9's other guard, run against every payee rather than once. A broker cannot
   * reach the receiving side by construction - the kinds above are fixed - and
   * this is what proves it stays that way, as well as catching a broker payer
   * that somebody has given a login.
   */
  for (const payee of payees) {
    const arrangement = brokerIsPayerNeverPayee({ payer, payee })
    if (!arrangement.ok) return arrangement
  }

  /* ---- the arithmetic. Three lines, and the third is a subtraction. ---- */

  const agentPercentBp = agent ? agent.sharePercentBp : 0
  const subAgentPercentBp = subAgent ? subAgent.sharePercentBp : 0

  const payIn = proportionOf(basis, agencyPercentBp)
  const subAgentShare = proportionOf(payIn, subAgentPercentBp)
  const agentNet = proportionOf(payIn, agentPercentBp - subAgentPercentBp)

  // The agent's cut is the sum of its two children, never a third truncation:
  // that is what makes "carved from the agent's own cut" true to the paisa.
  const agentCut = fromPaise(agentNet.paise + subAgentShare.paise, basis.currency)

  // The residual, and the reason the parts always sum to the whole. `netProfit`
  // is deliberately NOT derived from a percentage - see the module header on who
  // absorbs the remainder and why it is the agency.
  const netProfit = fromPaise(
    payIn.paise - agentNet.paise - subAgentShare.paise,
    basis.currency,
  )

  const idBase = ['lgr', policyId, TRIGGER_SLUGS[trigger], occurrence]
    .filter((part): part is string => Boolean(part))
    .join('-')

  const entries: CommissionLedgerEntry[] = [
    {
      id: `${idBase}-payin`,
      policyId,
      agencyId,
      agentId: null,
      subAgentId: null,
      kind: COMMISSION_ENTRY_KINDS.commissionBooked,
      amount: payIn,
      bookedAt,
      bookedBy,
      note:
        channel === COMMISSION_CHANNELS.brokerChannel
          ? `Pay-in at ${formatPercentBp(agencyPercentBp)} of the recorded premium, through broker ${payer.id}, on ${trigger}.`
          : `Pay-in at ${formatPercentBp(agencyPercentBp)} of the recorded premium, from ${payer.id} on the agency's own code, on ${trigger}.`,
    },
  ]

  if (agent) {
    entries.push({
      id: `${idBase}-agent`,
      policyId,
      agencyId,
      agentId: agent.id,
      subAgentId: null,
      kind: COMMISSION_ENTRY_KINDS.agentShare,
      amount: agentNet,
      bookedAt,
      bookedBy,
      note: subAgent
        ? `Agent cut at ${formatPercentBp(agentPercentBp)} of the pay-in, less the ${formatPercentBp(subAgentPercentBp)} carved out for the sub-agent.`
        : `Agent cut at ${formatPercentBp(agentPercentBp)} of the pay-in.`,
    })
  }

  if (subAgent) {
    entries.push({
      id: `${idBase}-subagent`,
      policyId,
      agencyId,
      agentId: agent ? agent.id : null,
      subAgentId: subAgent.id,
      kind: COMMISSION_ENTRY_KINDS.subAgentShare,
      amount: subAgentShare,
      bookedAt,
      bookedBy,
      note: `Sub-agent share at ${formatPercentBp(subAgentPercentBp)} of the pay-in, carved from the agent's own cut.`,
    })
  }

  return {
    ok: true,
    chain: {
      trigger,
      policyId,
      channel,
      payer,
      payees,
      agencyId,
      agentId: agent ? agent.id : null,
      subAgentId: subAgent ? subAgent.id : null,
      basis,
      agencyPercentBp,
      agentPercentBp,
      subAgentPercentBp,
      payIn,
      agentCut,
      agentNet,
      subAgentShare,
      netProfit,
      entries,
    },
  }
}
