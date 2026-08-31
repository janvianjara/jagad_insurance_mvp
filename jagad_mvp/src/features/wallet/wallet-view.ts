/**
 * `/wallet` - the sub-agent's own statement, derived. Pure: no DOM, no
 * repository, no React.
 *
 * ---------------------------------------------------------------------------
 * The isolation, and where it is enforced
 * ---------------------------------------------------------------------------
 *
 * The wallet is the acid test of §11's row scope, so the narrowing happens
 * twice, at two different levels, and the second one is not redundant:
 *
 *   1. `commissionDesk.book(viewer, 'wallet')` applies `visibleTo` over the
 *      whole policy set under the `wallet` grant. A sub-agent's scope is `own`,
 *      so a policy sourced by anybody else - including a sibling sub-agent
 *      reporting to the same agent - never enters the read at all.
 *
 *   2. `myLines` below keeps only the lines whose PAYEE is this person. That
 *      matters because step 1 admits a whole policy, and a policy Meera sourced
 *      still carries the agency's pay-in line and her parent agent's cut. Those
 *      are other parties' money on her own business, and a wallet that showed
 *      them would be telling a sub-agent what her agent earns off her.
 *
 * Neither step trusts the other, and neither is a filter written as "hide what
 * belongs to someone else" - both keep only what belongs to this person.
 *
 * ---------------------------------------------------------------------------
 * What it will not compute
 * ---------------------------------------------------------------------------
 *
 * Every figure here is a roll-up of commission lines by addition, which is the
 * one operation D3 permits. `unpaid` is the amount earned WHILE nothing has been
 * recorded as paid - an identity, not a subtraction - and becomes `null` the
 * moment a payout is recorded, because netting one figure against another is
 * arithmetic this platform does not perform on money it did not record.
 */

import { sumMoney } from '../../domain/money'
import type { Money } from '../../domain/money'
import type { LedgerEntry } from '../../data/repo'
import { periodLabel } from '../commission'
import type { LedgerLine } from '../commission'

/**
 * The lines this person is the payee of.
 *
 * Matched on `partyId`, which is the id of whoever is being paid at that level
 * of the chain - so an agent sees their own cut and a sub-agent sees their own
 * share, and neither sees the other's off the same policy.
 */
export function myLines(
  lines: readonly LedgerLine[],
  agentId: string,
): readonly LedgerLine[] {
  return lines.filter((line) => line.partyId === agentId && line.computed !== null)
}

export type WalletPeriod = {
  readonly period: string
  readonly label: string
  readonly total: Money
  readonly lines: readonly LedgerLine[]
}

export type WalletStatement = {
  /** Everything this person has earned across the whole book. */
  readonly earned: Money
  /** The most recent month with anything in it, or null on an empty statement. */
  readonly latest: WalletPeriod | null
  /** What somebody recorded as paid to this person. Null - not zero - when nothing was. */
  readonly recordedPaid: Money | null
  /** Earned while nothing has been recorded as paid. Null once anything has. */
  readonly unpaid: Money | null
  readonly lineCount: number
  /** Newest month first, which is the order a person reads their own statement in. */
  readonly periods: readonly WalletPeriod[]
}

export function walletStatement(
  lines: readonly LedgerLine[],
  recorded: readonly LedgerEntry[],
): WalletStatement {
  const byPeriod = new Map<string, LedgerLine[]>()
  for (const line of lines) {
    const bucket = byPeriod.get(line.period)
    if (bucket) bucket.push(line)
    else byPeriod.set(line.period, [line])
  }

  const periods: WalletPeriod[] = [...byPeriod.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([period, bucket]) => ({
      period,
      label: periodLabel(period),
      total: sumMoney(
        bucket.map((line) => line.computed).filter((amount): amount is Money => amount !== null),
      ),
      lines: [...bucket].sort((a, b) => b.bookedAt.localeCompare(a.bookedAt)),
    }))

  const earned = sumMoney(periods.map((period) => period.total))

  return {
    earned,
    latest: periods[0] ?? null,
    recordedPaid: recorded.length === 0 ? null : sumMoney(recorded.map((entry) => entry.amount)),
    unpaid: recorded.length === 0 ? earned : null,
    lineCount: lines.length,
    periods,
  }
}

/** The payouts recorded against this person, whichever side of the chain they sit. */
export function myPayouts(
  recorded: readonly LedgerEntry[],
  agentId: string,
): readonly LedgerEntry[] {
  return recorded.filter((entry) => entry.subAgentId === agentId || entry.agentId === agentId)
}

/** The period a URL asked for, when the statement actually has one. */
export function periodFromUrl(
  statement: WalletStatement,
  asked: string | null,
): WalletPeriod | null {
  if (asked === null) return null
  return statement.periods.find((period) => period.period === asked) ?? null
}
