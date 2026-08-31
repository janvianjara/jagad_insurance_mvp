/**
 * `/commission/ledger` - the line-by-line book, derived. Pure: no DOM, no
 * repository, no React.
 *
 * ---------------------------------------------------------------------------
 * What a line IS, and why it is not a policy
 * ---------------------------------------------------------------------------
 *
 * `/commission` answers "what did the book earn", one row per policy, with the
 * chain folded up inside it. This module unfolds it: a line here is ONE party
 * being paid ONE amount at ONE level of the chain, which is the grain an
 * accountant reconciles at and the grain a payout is made at. Three lines can
 * come off a single policy - the agency's pay-in, the agent's cut, the
 * sub-agent's share - and each is a different party's money.
 *
 * ---------------------------------------------------------------------------
 * Computed and booked are two different things, and stay two different things
 * ---------------------------------------------------------------------------
 *
 * `CommissionRepository` has no write API. Nothing in this build ever booked a
 * commission entry, so every computed line below is recomputed from the
 * percentages in configuration on each read, and the handful of
 * `commission_booked` rows in the fixture set were recorded by a person off an
 * insurer's statement. They are not the same kind of fact and the ledger never
 * pretends they are:
 *
 *   `origin: 'computed'`  what the arrangement implies, from `commissionChain`
 *   `origin: 'booked'`    what somebody recorded off a statement
 *
 * Where both exist for one policy the pay-in line carries both figures and a
 * reconciliation state that NAMES the disagreement. What it does not do is
 * subtract one from the other. D3 allows exactly two operations on money, and a
 * variance is neither of them - it is also, in practice, a conversation with the
 * insurer rather than a number a platform is entitled to assert. So the ledger
 * says "the statement figure is higher than the computed pay-in" and prints
 * both, which is what an accountant actually needs to open the conversation.
 */

import { compareMoney, equalsMoney, sumMoney } from '../../domain/money'
import type { Money } from '../../domain/money'
import { COMMISSION_ENTRY_KINDS, COMMISSION_TRIGGERS } from '../../domain/commission'
import type { CommissionChannel, CommissionTrigger } from '../../domain/commission'
import type { ScopeSource } from '../../domain/visibility'
import type { ListQuery, Page } from '../../data/repo'
import type { CommissionBook, CommissionChainRow } from './commission-view'

/* ------------------------------------------------------------------- vocabulary */

/** Which level of §9's chain a line sits at. The order money moves in. */
export const LEDGER_LEVELS = {
  agency: 'agency',
  agent: 'agent',
  subAgent: 'sub_agent',
} as const

export type LedgerLevel = (typeof LEDGER_LEVELS)[keyof typeof LEDGER_LEVELS]

export const LEDGER_LEVEL_LABELS: Readonly<Record<LedgerLevel, string>> = {
  agency: 'Agency pay-in',
  agent: 'Agent cut',
  sub_agent: 'Sub-agent share',
}

/** Where the figure came from. The distinction this screen is built around. */
export const LEDGER_ORIGINS = {
  computed: 'computed',
  booked: 'booked',
} as const

export type LedgerOrigin = (typeof LEDGER_ORIGINS)[keyof typeof LEDGER_ORIGINS]

export const LEDGER_ORIGIN_LABELS: Readonly<Record<LedgerOrigin, string>> = {
  computed: 'Computed',
  booked: 'Booked',
}

/** §9's three triggers, in the words a person books business under. */
export const SOURCE_LABELS: Readonly<Record<CommissionTrigger, string>> = {
  'policy.issued': 'New business',
  'renewal.completed': 'Renewal',
  'endorsement.approved': 'Endorsement',
}

/**
 * How a computed line stands against the insurer's statement.
 *
 * `no_computation` is the row an accountant hunts for: a figure booked off a
 * statement that no chain in this book accounts for. It is carried rather than
 * dropped, which is the whole reason the ledger reads both sides.
 */
export const RECONCILIATIONS = {
  agrees: 'agrees',
  differs: 'differs',
  notBooked: 'not_booked',
  noComputation: 'no_computation',
  notApplicable: 'not_applicable',
} as const

export type Reconciliation = (typeof RECONCILIATIONS)[keyof typeof RECONCILIATIONS]

export const RECONCILIATION_LABELS: Readonly<Record<Reconciliation, string>> = {
  agrees: 'Agrees with statement',
  differs: 'Differs from statement',
  not_booked: 'Not booked yet',
  no_computation: 'No computation',
  not_applicable: 'Internal split',
}

/** The sentence under the state. Never "mismatch" - say which way, and what to do. */
export const RECONCILIATION_EXPLANATIONS: Readonly<Record<Reconciliation, string>> = {
  agrees:
    'The figure recorded off the insurer statement is the computed pay-in, to the paisa.',
  differs:
    'The statement figure and the computed pay-in are not the same. Both are shown; the platform does not subtract one from the other, because the difference is a conversation with the insurer rather than a figure this screen is entitled to assert.',
  not_booked:
    'Nothing has been recorded against this policy from an insurer statement, so there is nothing to reconcile against yet.',
  no_computation:
    'A figure was booked off a statement, and no chain in this book accounts for it. Either the policy is outside this view or its appointment has no percentage configured.',
  not_applicable:
    'An internal split of the pay-in. An insurer statement books the pay-in and never the shares carved out of it, so there is nothing to reconcile a share against.',
}

export const RECONCILIATION_TONES: Readonly<Record<Reconciliation, 'ok' | 'warn' | 'bad' | 'idle'>> =
  {
    agrees: 'ok',
    differs: 'bad',
    not_booked: 'warn',
    no_computation: 'bad',
    not_applicable: 'idle',
  }

/* ------------------------------------------------------------------------ line */

export type LedgerLine = {
  readonly id: string
  readonly origin: LedgerOrigin
  readonly policyId: string
  /** The policy's own number. Empty on a booked row whose policy is not in this book. */
  readonly systemNo: string
  readonly insurerNo: string | null
  readonly customerName: string
  readonly placement: string
  readonly channel: CommissionChannel | null
  readonly level: LedgerLevel
  /** Who is being paid at this level. */
  readonly partyId: string
  readonly partyName: string
  readonly trigger: CommissionTrigger | null
  /** The rate the amount was worked out at, in basis points. Null on a booked row. */
  readonly percentBp: number | null
  /** What the chain computed. Null on a booked row nothing accounts for. */
  readonly computed: Money | null
  /** What a person recorded off a statement. Only the pay-in level is ever booked. */
  readonly booked: Money | null
  readonly reconciliation: Reconciliation
  /** ISO date the line is dated by - the policy's own start, never a clock. */
  readonly bookedAt: string
  /** `YYYY-MM`, the period a payout cycle groups by. */
  readonly period: string
  readonly note: string
  /** §11's attributes, so the row can be scoped by the same predicate as the book. */
  readonly scope: ScopeSource
}

const LEVEL_OF_ENTRY_KIND: Readonly<Record<string, LedgerLevel>> = {
  [COMMISSION_ENTRY_KINDS.commissionBooked]: LEDGER_LEVELS.agency,
  [COMMISSION_ENTRY_KINDS.agentShare]: LEDGER_LEVELS.agent,
  [COMMISSION_ENTRY_KINDS.subAgentShare]: LEDGER_LEVELS.subAgent,
}

/** `2026-08-14T…` to `2026-08`. A period is a month, and a month is a prefix. */
export function periodOf(iso: string): string {
  return iso.slice(0, 7)
}

/** `2026-08` to `August 2026`. A label, not an amount; formatting only. */
export function periodLabel(period: string): string {
  const [year, month] = period.split('-')
  const index = Number(month)
  if (!year || !Number.isInteger(index) || index < 1 || index > 12) return period
  const name = new Intl.DateTimeFormat('en-IN', { month: 'long' }).format(
    new Date(Date.UTC(2000, index - 1, 1)),
  )
  return `${name} ${year}`
}

function rateFor(row: CommissionChainRow, level: LedgerLevel): number {
  const { chain } = row
  if (level === LEDGER_LEVELS.agency) return chain.agencyPercentBp
  if (level === LEDGER_LEVELS.subAgent) return chain.subAgentPercentBp
  // What the agent actually keeps is their own rate less the carve-out, and that
  // is the rate that produced the amount on the line. Printing the gross rate
  // beside the net figure is how a person is asked to take a number on trust.
  return chain.agentPercentBp - chain.subAgentPercentBp
}

function partyFor(
  row: CommissionChainRow,
  level: LedgerLevel,
): { readonly id: string; readonly name: string } {
  if (level === LEDGER_LEVELS.agency) {
    return { id: row.chain.agencyId, name: row.agencyName }
  }
  if (level === LEDGER_LEVELS.subAgent) {
    return { id: row.chain.subAgentId ?? '', name: row.subAgentName ?? 'Sub-agent' }
  }
  return { id: row.chain.agentId ?? '', name: row.agentName ?? 'Agent' }
}

/**
 * How the pay-in line stands against the statement.
 *
 * Comparison only. `compareMoney` returns a sign, and the sign is all this uses -
 * no third amount is minted, and none can be.
 */
function reconciliationFor(level: LedgerLevel, computed: Money, booked: Money | null): Reconciliation {
  if (level !== LEDGER_LEVELS.agency) return RECONCILIATIONS.notApplicable
  if (booked === null) return RECONCILIATIONS.notBooked
  return equalsMoney(computed, booked) ? RECONCILIATIONS.agrees : RECONCILIATIONS.differs
}

/**
 * Which way a disagreement goes, in words. Reads the sign of a comparison and
 * never the size of one, so no figure is created here.
 */
export function varianceDirection(line: LedgerLine): string | null {
  if (line.reconciliation !== RECONCILIATIONS.differs) return null
  if (line.computed === null || line.booked === null) return null
  return compareMoney(line.booked, line.computed) > 0
    ? 'The statement figure is higher than the computed pay-in.'
    : 'The statement figure is lower than the computed pay-in.'
}

/**
 * Every line in the book, computed lines first and then the booked rows nothing
 * accounts for.
 *
 * A booked row whose policy DID produce a chain is not repeated as a line of its
 * own: it is already on that policy's pay-in line, beside the figure it is being
 * compared with, which is the only place the comparison means anything.
 */
export function ledgerLines(book: CommissionBook): readonly LedgerLine[] {
  const lines: LedgerLine[] = []
  const chained = new Set<string>()

  for (const row of book.rows) {
    chained.add(row.policyId)

    for (const entry of row.ledgerRows) {
      const level = LEVEL_OF_ENTRY_KIND[entry.kind]
      if (!level) continue

      const booked = level === LEDGER_LEVELS.agency ? row.bookedFromStatement : null
      const party = partyFor(row, level)

      lines.push({
        id: entry.id,
        origin: LEDGER_ORIGINS.computed,
        policyId: row.policyId,
        systemNo: row.systemNo,
        insurerNo: row.insurerNo,
        customerName: row.customerName,
        placement: `${row.companyName} ${row.productName}`,
        channel: row.chain.channel,
        level,
        partyId: party.id,
        partyName: party.name,
        trigger: row.chain.trigger,
        percentBp: rateFor(row, level),
        computed: entry.amount,
        booked,
        reconciliation: reconciliationFor(level, entry.amount, booked),
        bookedAt: entry.bookedAt,
        period: periodOf(entry.bookedAt),
        note: entry.note,
        scope: row.scope,
      })
    }
  }

  for (const entry of book.booked) {
    if (chained.has(entry.policyId)) continue

    lines.push({
      id: entry.id,
      origin: LEDGER_ORIGINS.booked,
      policyId: entry.policyId,
      systemNo: '',
      insurerNo: null,
      customerName: 'Not in this book',
      placement: 'Not in this book',
      channel: null,
      level: LEDGER_LEVELS.agency,
      partyId: entry.agencyId,
      partyName: entry.agencyId,
      trigger: null,
      percentBp: null,
      computed: null,
      booked: entry.amount,
      reconciliation: RECONCILIATIONS.noComputation,
      bookedAt: entry.bookedAt,
      period: periodOf(entry.bookedAt),
      note: entry.note,
      scope: { agentId: entry.agentId, subAgentId: entry.subAgentId },
    })
  }

  return lines
}

/* -------------------------------------------------------------------- summary */

export type LedgerSummary = {
  readonly lineCount: number
  /** Roll-up of every computed line at the agency level - what came in. */
  readonly computedPayIn: Money
  /** Roll-up of every figure recorded off a statement. */
  readonly bookedTotal: Money
  readonly agreeing: number
  readonly differing: number
  readonly notBooked: number
  readonly unaccounted: number
}

/**
 * The three counts an accountant asks for before reading a single row, and the
 * two totals they are counts of. Addition only.
 */
export function ledgerSummary(lines: readonly LedgerLine[]): LedgerSummary {
  const payInLines = lines.filter((line) => line.level === LEDGER_LEVELS.agency)

  return {
    lineCount: lines.length,
    computedPayIn: sumMoney(
      payInLines
        .map((line) => line.computed)
        .filter((amount): amount is Money => amount !== null),
    ),
    bookedTotal: sumMoney(
      payInLines.map((line) => line.booked).filter((amount): amount is Money => amount !== null),
    ),
    agreeing: lines.filter((line) => line.reconciliation === RECONCILIATIONS.agrees).length,
    differing: lines.filter((line) => line.reconciliation === RECONCILIATIONS.differs).length,
    notBooked: lines.filter((line) => line.reconciliation === RECONCILIATIONS.notBooked).length,
    unaccounted: lines.filter((line) => line.reconciliation === RECONCILIATIONS.noComputation)
      .length,
  }
}

/** Distinct values for a filter's option list, in the order they read best. */
export function partiesIn(lines: readonly LedgerLine[]): readonly string[] {
  return [...new Set(lines.map((line) => line.partyName))].sort((a, b) => a.localeCompare(b))
}

export function periodsIn(lines: readonly LedgerLine[]): readonly string[] {
  return [...new Set(lines.map((line) => line.period))].sort().reverse()
}

/* --------------------------------------------------------------------- paging */

/**
 * The sort fields the ledger declares. A URL naming another is ignored.
 *
 * These are column ids, and deliberately so: `<DataTable>` reports a sort by the
 * id of the column that was clicked, and `<WorkQueue>` writes that straight into
 * the URL. A friendlier alias here would be a second vocabulary that the header
 * and the address bar would eventually disagree about.
 */
export const LEDGER_SORT_FIELDS = ['bookedAt', 'computed', 'partyName'] as const

function amountOf(line: LedgerLine): number {
  return (line.computed ?? line.booked)?.paise ?? 0
}

function matchesSearch(line: LedgerLine, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (needle === '') return true
  return [line.systemNo, line.insurerNo ?? '', line.customerName, line.partyName, line.placement]
    .join(' ')
    .toLowerCase()
    .includes(needle)
}

function matchesFilters(line: LedgerLine, filters: Readonly<Record<string, readonly string[]>>): boolean {
  const wanted = (key: string) => filters[key] ?? []
  const on = (key: string, value: string | null) => {
    const values = wanted(key)
    if (values.length === 0) return true
    return value !== null && values.includes(value)
  }

  return (
    on('party', line.partyName) &&
    on('period', line.period) &&
    on('source', line.trigger) &&
    on('status', line.reconciliation) &&
    on('level', line.level)
  )
}

/**
 * The ledger's own pager - filter, sort, page - over lines that were derived
 * once for the whole book.
 *
 * It lives here rather than in the repository because the lines are not stored
 * anywhere: they are recomputed from configuration on every read, which is the
 * honest consequence of a commission repository with no write API. A `ListQuery`
 * is still what comes in, so the queue's URL contract is unchanged and the
 * screen is reconstructible from its address exactly as every other queue is.
 */
export function pageOfLines(
  lines: readonly LedgerLine[],
  query: ListQuery,
  defaultPageSize = 25,
): Page<LedgerLine> {
  const filters = query.filters ?? {}
  const matched = lines.filter(
    (line) => matchesSearch(line, query.search ?? '') && matchesFilters(line, filters),
  )

  const sort = query.sort ?? { field: 'bookedAt', direction: 'desc' as const }
  const direction = sort.direction === 'desc' ? -1 : 1
  const sorted = [...matched].sort((a, b) => {
    if (sort.field === 'computed') return (amountOf(a) - amountOf(b)) * direction
    if (sort.field === 'partyName') return a.partyName.localeCompare(b.partyName) * direction
    return a.bookedAt.localeCompare(b.bookedAt) * direction
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

/** The trigger set, for the source filter's options. */
export const LEDGER_SOURCES: readonly CommissionTrigger[] = [
  COMMISSION_TRIGGERS.policyIssued,
  COMMISSION_TRIGGERS.renewalCompleted,
  COMMISSION_TRIGGERS.endorsementApproved,
]
