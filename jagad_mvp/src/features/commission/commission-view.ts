/**
 * The commission ledger, derived. Pure - no DOM, no repository, no React.
 *
 * Everything money-shaped in here comes out of `src/domain/commission`. This
 * module groups and labels; it never divides, never applies a rate and never
 * invents a figure. The one arithmetic it does is `sumMoney`, which is the
 * roll-up primitive the product already allows (§8).
 *
 * The screen this feeds is read-only by design (§9: "the Assistant reads this
 * ledger and never writes to it, from any role including admin"), so there is no
 * command shape here and no mutation to gate.
 */

import { sumMoney } from '../../domain/money'
import type { Money } from '../../domain/money'
import type { ScopeSource } from '../../domain/visibility'
import { COMMISSION_CHANNELS, chainReconciles } from '../../domain/commission'
import type { CommissionChain, CommissionChannel } from '../../domain/commission'
import type { LedgerEntry } from '../../data/repo'

/** How a channel is written on screen. Two channels, §9's payer fork. */
export const CHANNEL_LABELS: Readonly<Record<CommissionChannel, string>> = {
  own_code: 'Own code',
  broker_channel: 'Broker channel',
}

/** What each channel means, for the caption under the total. */
export const CHANNEL_EXPLANATIONS: Readonly<Record<CommissionChannel, string>> = {
  own_code: 'Placed on the agency own appointment. The insurance company pays.',
  broker_channel: 'Placed through a broking code. The broker pays, and is never paid.',
}

/** One policy's chain, with the names a person reads instead of ids. */
export type CommissionChainRow = {
  readonly policyId: string
  readonly systemNo: string
  readonly insurerNo: string | null
  readonly customerName: string
  readonly companyName: string
  readonly productName: string
  readonly agencyName: string
  readonly payerName: string
  readonly agentName: string | null
  readonly subAgentName: string | null
  readonly chain: CommissionChain
  /**
   * The chain's own rows, typed as the data layer's `LedgerEntry`.
   *
   * `src/domain` may not import from `src/data`, so the domain restates the row
   * shape; this field is where the two meet, and the assignment in the desk is
   * what makes the compiler notice the day they drift apart. Nothing writes
   * them - they are what a write would write.
   */
  readonly ledgerRows: readonly LedgerEntry[]
  /**
   * What somebody booked against this policy from the insurer's statement, when
   * a row exists. Shown beside the computed pay-in and never subtracted from it:
   * a variance is a conversation with the insurer, not a number this screen
   * makes up.
   */
  readonly bookedFromStatement: Money | null
  /**
   * The attributes §11's row-level scope is tested against.
   *
   * Carried on the row rather than re-derived per screen, so the ledger, the
   * payout cycle and the wallet all ask `visibleTo` the same question about the
   * same facts. A second derivation is how two money screens come to disagree
   * about whose book a line belongs to, and the generous one is the leak.
   */
  readonly scope: ScopeSource
}

/** A policy whose chain could not be worked out, and the sentence saying why. */
export type CommissionRefusal = {
  readonly policyId: string
  readonly systemNo: string
  readonly reason: string
}

/**
 * A roll-up of chains: the four figures, and how many policies made them.
 *
 * `agentShare` is what agents KEEP - the cut less anything carved out for a
 * sub-agent - so the three outward figures add to `payIn` at the total exactly
 * as they do on a single chain. Summing the gross cut instead would double-count
 * every sub-agent share in the book.
 */
export type CommissionTotal = {
  readonly policyCount: number
  readonly payIn: Money
  readonly agentShare: Money
  readonly subAgentShare: Money
  readonly netProfit: Money
}

export type ChannelTotal = CommissionTotal & { readonly channel: CommissionChannel }

export type CommissionBook = {
  readonly rows: readonly CommissionChainRow[]
  readonly refusals: readonly CommissionRefusal[]
  readonly channels: readonly ChannelTotal[]
  readonly totals: CommissionTotal | null
  /**
   * Every `commission_booked` row a person recorded off an insurer statement,
   * inside this viewer's scope - including the ones whose policy produced no
   * chain at all. The ledger shows those beside the computed lines rather than
   * dropping them, because a booked figure nothing accounts for is precisely
   * what an accountant opens a ledger to find.
   */
  readonly booked: readonly LedgerEntry[]
  /**
   * Payouts somebody recorded against a payee, inside this viewer's scope.
   *
   * Empty in this build, and that emptiness is a fact rather than a gap in the
   * read: `CommissionRepository` exposes no write, so nothing has ever booked a
   * payout. The payout cycle reads this list to say "nothing has been recorded
   * as paid" out loud, instead of printing a zero that would read as settled.
   */
  readonly payoutsRecorded: readonly LedgerEntry[]
}

function totalOf(rows: readonly CommissionChainRow[]): CommissionTotal {
  return {
    policyCount: rows.length,
    payIn: sumMoney(rows.map((row) => row.chain.payIn)),
    agentShare: sumMoney(rows.map((row) => row.chain.agentNet)),
    subAgentShare: sumMoney(rows.map((row) => row.chain.subAgentShare)),
    netProfit: sumMoney(rows.map((row) => row.chain.netProfit)),
  }
}

/**
 * Booked totals by channel.
 *
 * A channel with no business still gets a row rather than disappearing. An owner
 * asking "how much came in through brokers" deserves the answer "nothing this
 * period" over an absence they have to interpret (U13).
 */
export function channelTotals(rows: readonly CommissionChainRow[]): readonly ChannelTotal[] {
  return [COMMISSION_CHANNELS.ownCode, COMMISSION_CHANNELS.brokerChannel].map((channel) => ({
    channel,
    ...totalOf(rows.filter((row) => row.chain.channel === channel)),
  }))
}

/**
 * The whole book as one line. Null when there is nothing in it - an empty book
 * has no total, and printing four zeroes would read as a period that earned
 * nothing rather than as a period with no data.
 */
export function bookTotal(rows: readonly CommissionChainRow[]): CommissionTotal | null {
  if (rows.length === 0) return null
  return totalOf(rows)
}

/**
 * True when every row in the book reconciles, using the domain's own invariant
 * rather than a second copy of it. The screen says so out loud, because a total
 * that claims to be exact should be able to point at what checked it.
 */
export function bookReconciles(rows: readonly CommissionChainRow[]): boolean {
  return rows.every((row) => chainReconciles(row.chain))
}

