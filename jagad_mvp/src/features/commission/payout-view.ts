/**
 * `/commission/payouts` - the payout cycle, derived. Pure: no DOM, no
 * repository, no React.
 *
 * ---------------------------------------------------------------------------
 * The question this screen answers, and how it differs from the other two
 * ---------------------------------------------------------------------------
 *
 *   `/commission`         what did the book earn, and how
 *   `/commission/ledger`  which line, on which policy, at which rate
 *   here                  who do we owe, for which period, and has it gone out
 *
 * A payout row is a PERIOD and a PARTY, never a policy: money leaves the agency
 * once a month per payee, not once per contract. So the rows here are grouped
 * rather than filtered - the same lines the ledger lists one by one are rolled
 * up into one figure per person per month, which is the shape a cheque is
 * written in.
 *
 * ---------------------------------------------------------------------------
 * What this build cannot do, said out loud
 * ---------------------------------------------------------------------------
 *
 * `CommissionRepository` is a read repository. It has `rules`, `ruleFor`,
 * `forPolicy` and `forAgent`, and no writer of any kind, so there is no way for
 * this screen to book a `payout` ledger entry and no way for it to mark one
 * released. That is not worked around here:
 *
 *   - `recordedPaid` is `null`, not zero, when nothing has been recorded against
 *     a party. Zero would read as "paid nothing", and the truth is "nobody has
 *     recorded anything at all".
 *   - `outstanding` is the amount due WHILE nothing has been recorded as paid,
 *     which is an identity rather than a subtraction. The moment a payout row
 *     exists for a party, `outstanding` becomes `null` and the screen says why:
 *     netting one against the other is arithmetic D3 does not allow, and the
 *     platform is not entitled to assert a balance nobody typed.
 *   - Releasing goes through `<ConfirmGate>` like every other outward move, and
 *     the gate says before it is confirmed that nothing will be written.
 */

import { sumMoney } from '../../domain/money'
import type { Money } from '../../domain/money'
import type { ScopeSource } from '../../domain/visibility'
import type { LedgerEntry, ListQuery, Page } from '../../data/repo'
import { LEDGER_LEVELS, periodLabel, periodOf } from './ledger-view'
import type { LedgerLine } from './ledger-view'

/** Who money leaves the agency for. The agency itself is not a payee (§9). */
export const PAYEE_KINDS = {
  agent: 'agent',
  subAgent: 'sub_agent',
} as const

export type PayeeKind = (typeof PAYEE_KINDS)[keyof typeof PAYEE_KINDS]

export const PAYEE_KIND_LABELS: Readonly<Record<PayeeKind, string>> = {
  agent: 'Agent',
  sub_agent: 'Sub-agent',
}

/** Where a party's money in one period has got to. */
export const PAYOUT_STATES = {
  /** Due, and nothing recorded against it. Every row in this build. */
  unpaid: 'unpaid',
  /** A payout was recorded. What remains is not computed here - see the header. */
  recorded: 'recorded',
} as const

export type PayoutState = (typeof PAYOUT_STATES)[keyof typeof PAYOUT_STATES]

export const PAYOUT_STATE_LABELS: Readonly<Record<PayoutState, string>> = {
  unpaid: 'Nothing paid',
  recorded: 'Payout recorded',
}

export const PAYOUT_STATE_TONES: Readonly<Record<PayoutState, 'warn' | 'ok'>> = {
  unpaid: 'warn',
  recorded: 'ok',
}

export type PayoutRow = {
  /** `period:partyId` - one payee, one month. */
  readonly id: string
  readonly period: string
  readonly periodLabel: string
  readonly partyId: string
  readonly partyName: string
  readonly partyKind: PayeeKind
  /** How many commission lines rolled into this figure. */
  readonly lineCount: number
  /** The roll-up of this party's lines in this period. Addition only. */
  readonly due: Money
  /** What somebody recorded as paid. Null - not zero - when nothing was recorded. */
  readonly recordedPaid: Money | null
  readonly payoutCount: number
  /**
   * What is still owed. The amount due while nothing has been recorded as paid,
   * and `null` once anything has: this screen will not net one figure against
   * another.
   */
  readonly outstanding: Money | null
  readonly state: PayoutState
  /**
   * GST on the payout - FR-14.7.
   *
   * Always `null`, and honestly so: no record in the model carries a GST figure
   * against a commission line. `Policy.gstAmount` is the GST on the customer's
   * premium, which is a different tax on a different transaction, and borrowing
   * it here would be inventing one. The column stands so that the day the ledger
   * carries the field there is a place for it and no layout changes.
   */
  readonly gst: Money | null
  readonly scope: ScopeSource
}

const PAYEE_LEVELS: Readonly<Record<string, PayeeKind>> = {
  [LEDGER_LEVELS.agent]: PAYEE_KINDS.agent,
  [LEDGER_LEVELS.subAgent]: PAYEE_KINDS.subAgent,
}

/**
 * Rolls the ledger's lines into one row per payee per period.
 *
 * Agency pay-in lines are dropped: the agency is the payer here, not a payee,
 * and its net profit is what is left rather than something owed to anyone. §9's
 * "a broker is a payer, never a payee" has the same shape and is enforced in the
 * chain itself, so no broker can reach this list either.
 */
export function payoutRows(
  lines: readonly LedgerLine[],
  recorded: readonly LedgerEntry[],
): readonly PayoutRow[] {
  const grouped = new Map<string, LedgerLine[]>()

  for (const line of lines) {
    const kind = PAYEE_LEVELS[line.level]
    if (!kind || line.partyId === '' || line.computed === null) continue
    const key = `${line.period}:${line.partyId}`
    const bucket = grouped.get(key)
    if (bucket) bucket.push(line)
    else grouped.set(key, [line])
  }

  const rows: PayoutRow[] = []

  for (const [key, bucket] of grouped) {
    const first = bucket[0]
    const kind = PAYEE_LEVELS[first.level]
    const paid = recorded.filter(
      (entry) =>
        periodOf(entry.bookedAt) === first.period &&
        (kind === PAYEE_KINDS.subAgent ? entry.subAgentId : entry.agentId) === first.partyId,
    )

    const due = sumMoney(
      bucket.map((line) => line.computed).filter((amount): amount is Money => amount !== null),
    )

    rows.push({
      id: key,
      period: first.period,
      periodLabel: periodLabel(first.period),
      partyId: first.partyId,
      partyName: first.partyName,
      partyKind: kind,
      lineCount: bucket.length,
      due,
      recordedPaid: paid.length === 0 ? null : sumMoney(paid.map((entry) => entry.amount)),
      payoutCount: paid.length,
      // An identity, not a subtraction: while nothing has been recorded as paid,
      // what is outstanding IS what is due. Once something has, this screen
      // stops being able to say, and says that instead.
      outstanding: paid.length === 0 ? due : null,
      state: paid.length === 0 ? PAYOUT_STATES.unpaid : PAYOUT_STATES.recorded,
      gst: null,
      scope: first.scope,
    })
  }

  return rows
}

export type PayoutSummary = {
  readonly rowCount: number
  readonly partyCount: number
  readonly periodCount: number
  readonly due: Money
  /** Null when nothing anywhere has been recorded as paid, which is the truth here. */
  readonly recordedPaid: Money | null
}

export function payoutSummary(rows: readonly PayoutRow[]): PayoutSummary {
  const paidRows = rows.filter((row) => row.recordedPaid !== null)

  return {
    rowCount: rows.length,
    partyCount: new Set(rows.map((row) => row.partyId)).size,
    periodCount: new Set(rows.map((row) => row.period)).size,
    due: sumMoney(rows.map((row) => row.due)),
    recordedPaid:
      paidRows.length === 0
        ? null
        : sumMoney(
            paidRows
              .map((row) => row.recordedPaid)
              .filter((amount): amount is Money => amount !== null),
          ),
  }
}

export function payoutPeriods(rows: readonly PayoutRow[]): readonly string[] {
  return [...new Set(rows.map((row) => row.period))].sort().reverse()
}

export function payoutParties(rows: readonly PayoutRow[]): readonly PayoutRow[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (seen.has(row.partyId)) return false
    seen.add(row.partyId)
    return true
  })
}

export const PAYOUT_SORT_FIELDS = ['period', 'due', 'partyName'] as const

/**
 * The payout queue's pager. Same contract as the ledger's and for the same
 * reason: these rows are derived on read, so the filtering that a repository
 * would normally do happens here, over a `ListQuery` that came off the URL.
 */
export function pageOfPayouts(
  rows: readonly PayoutRow[],
  query: ListQuery,
  defaultPageSize = 25,
): Page<PayoutRow> {
  const filters = query.filters ?? {}
  const needle = (query.search ?? '').trim().toLowerCase()

  const matched = rows.filter((row) => {
    if (needle !== '' && !row.partyName.toLowerCase().includes(needle)) return false
    const on = (key: string, value: string) => {
      const values = filters[key] ?? []
      return values.length === 0 || values.includes(value)
    }
    return on('period', row.period) && on('payee', row.partyKind) && on('state', row.state)
  })

  const sort = query.sort ?? { field: 'period', direction: 'desc' as const }
  const direction = sort.direction === 'desc' ? -1 : 1
  const sorted = [...matched].sort((a, b) => {
    if (sort.field === 'due') return (a.due.paise - b.due.paise) * direction
    if (sort.field === 'partyName') return a.partyName.localeCompare(b.partyName) * direction
    return a.period.localeCompare(b.period) * direction
  })

  const pageSize = query.pageSize ?? defaultPageSize
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount)

  return {
    rows: sorted.slice((page - 1) * pageSize, page * pageSize),
    total: sorted.length,
    page,
    pageSize,
    pageCount,
  }
}

/**
 * The one sentence the payout screen, its gate and its receipt all say, so that
 * they cannot drift into disagreeing about what a release did.
 *
 * Written once, here, because the honesty is the feature: a person who confirms
 * a release must be told the same thing before and after they confirm it.
 */
export const RELEASE_WRITES_NOTHING =
  'Nothing was released. This build has no write path to the commission ledger - CommissionRepository is read-only - so no payout entry was created and no money moved. Pay through the bank as usual and book the entry when the ledger can hold one.'
