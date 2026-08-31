/**
 * Commission and net profit, as a report — FR-19.4.
 *
 * ---------------------------------------------------------------------------
 * This module contains no commission arithmetic, and must never contain any
 * ---------------------------------------------------------------------------
 *
 * `src/domain/commission.ts` owns the chain: it is the one place in the product
 * allowed to multiply money, it is tested to the paisa, and it is correct. The
 * commission desk owns the read, applies §11's row-level scope before anything
 * is chained, and hands back a `CommissionBook`. `/commission` and
 * `/commission/ledger` own the desks a person WORKS from.
 *
 * What is left, and what this file is, is the REPORT: the same book, grouped and
 * rolled up so an owner can ask "what did we earn last year, and how much of it
 * did we keep". Every figure below arrives already computed. The only operation
 * performed here is `bookTotal`, which is the commission feature's own roll-up —
 * `sumMoney` over rows — reused rather than rewritten, because a second
 * definition of "the book's total" is a second number to disagree with.
 *
 * There is no rate in this file, no percentage, no division and no forecast.
 *
 * ---------------------------------------------------------------------------
 * Why the period is read off the policy and not off the chain
 * ---------------------------------------------------------------------------
 *
 * A chain has no date. It is what an arrangement implies about a placement, and
 * the placement's date is the policy's recorded start date — the day the cover
 * began, which is the day the business was written. So the period filter joins
 * back to the policy rather than inventing a booking date, and a policy with no
 * start date recorded falls OUTSIDE every bounded period rather than quietly
 * inside all of them. It is still in "Everything on the book", which is the only
 * honest place for a row whose date nobody typed, and the screen says how many
 * such rows a total covers.
 */

import { COMMISSION_TRIGGERS } from '../../../domain/commission'
import type { CommissionTrigger } from '../../../domain/commission'
import type { Repositories } from '../../../data/repo'
import type { User } from '../../../domain/permissions'
import { bookTotal } from '../../commission/commission-view'
import { commissionDesk } from '../../commission/data/commission-desk'
import type { CommissionChainRow, CommissionTotal } from '../../commission/commission-view'
import { withinWindow } from '../report-params'
import type { ReportConfig } from '../report-params'
import { financialYearLabel, financialYearOf } from './reports-desk'

const SCAN_SIZE = 10_000

/** §9's three triggers, in the words a person books business under. */
export const TRIGGER_LABELS: Readonly<Record<CommissionTrigger, string>> = {
  [COMMISSION_TRIGGERS.policyIssued]: 'New business',
  [COMMISSION_TRIGGERS.renewalCompleted]: 'Renewal',
  [COMMISSION_TRIGGERS.endorsementApproved]: 'Endorsement',
}

/**
 * What the report needs to know about a chained policy that the chain does not
 * carry: when it was written, and who it sits with.
 *
 * Passed in rather than looked up inside the grouping, so the grouping stays a
 * pure function of its inputs and a test can drive it without a repository.
 */
export type PlacementFacts = {
  readonly startDate: string | null
  readonly companyId: string | null
}

/** One grouped line. Every amount on it came out of `bookTotal`. */
export type CommissionGroupRow = CommissionTotal & {
  readonly key: string
  readonly label: string
}

export type CommissionReport = {
  readonly windowLabel: string
  readonly groupLabel: string
  readonly rows: readonly CommissionGroupRow[]
  /**
   * Null when nothing is in the window. An empty book has no total, and four
   * zeroes would read as a period that earned nothing rather than as a period
   * with nothing in it.
   */
  readonly total: CommissionTotal | null
  /** Chained placements the period or the company filter left out. */
  readonly excluded: number
  /**
   * Placements the chain refused — no percentage configured, a placement outside
   * the agency's appointed scope. Counted rather than dropped: a policy earning
   * nothing because nobody configured a rate is exactly what an owner opens this
   * report to find.
   */
  readonly refusals: number
  /** Counted rows whose policy carries no recorded start date. */
  readonly undated: number
}

const GROUP_LABELS: Readonly<Record<string, string>> = {
  source: 'Source of business',
  company: 'Insurance company',
  agent: 'Agent',
  year: 'Financial year',
}

type Keyed = { readonly key: string; readonly label: string }

function keyOf(row: CommissionChainRow, group: string, facts: PlacementFacts): Keyed {
  if (group === 'company') return { key: row.companyName, label: row.companyName }
  if (group === 'agent') {
    return row.agentName === null
      ? { key: 'direct', label: 'Placed direct, no agent' }
      : { key: row.agentName, label: row.agentName }
  }
  if (group === 'year') {
    if (facts.startDate === null) return { key: 'undated', label: 'No start date recorded' }
    const year = financialYearOf(facts.startDate)
    return { key: String(year), label: financialYearLabel(year) }
  }
  const trigger = row.chain.trigger
  return { key: trigger, label: TRIGGER_LABELS[trigger] ?? trigger }
}

const UNKNOWN: PlacementFacts = { startDate: null, companyId: null }

/**
 * The report, grouped and totalled. Pure, so a test can hand it rows and check
 * that the group totals add back to the whole.
 *
 * Rows are ordered by pay-in descending — the biggest line first is how a money
 * table is read — except by financial year, where chronological order is the
 * comparison the grouping exists for.
 */
export function buildCommissionReport(
  rows: readonly CommissionChainRow[],
  facts: ReadonlyMap<string, PlacementFacts>,
  config: ReportConfig,
  refusals: number,
): CommissionReport {
  const factsFor = (row: CommissionChainRow) => facts.get(row.policyId) ?? UNKNOWN

  const included = rows.filter((row) => {
    const placement = factsFor(row)
    if (config.companyId !== null && placement.companyId !== config.companyId) return false
    const bounded = config.window.from !== null || config.window.to !== null
    if (bounded && !withinWindow(placement.startDate, config.window)) return false
    return true
  })

  const buckets = new Map<string, { label: string; rows: CommissionChainRow[] }>()
  for (const row of included) {
    const { key, label } = keyOf(row, config.group, factsFor(row))
    const bucket = buckets.get(key)
    if (bucket) bucket.rows.push(row)
    else buckets.set(key, { label, rows: [row] })
  }

  const grouped: CommissionGroupRow[] = []
  for (const [key, bucket] of buckets) {
    const total = bookTotal(bucket.rows)
    if (total === null) continue
    grouped.push({ key, label: bucket.label, ...total })
  }

  const ordered =
    config.group === 'year'
      ? grouped.sort((a, b) => a.key.localeCompare(b.key))
      : grouped.sort((a, b) => b.payIn.paise - a.payIn.paise || a.label.localeCompare(b.label))

  return {
    windowLabel: config.window.label,
    groupLabel: GROUP_LABELS[config.group] ?? GROUP_LABELS.source,
    rows: ordered,
    // The total is built from the same rows the table groups, not from a second
    // pass over the source, so the columns and the foot cannot disagree.
    total: bookTotal(included),
    excluded: rows.length - included.length,
    refusals,
    undated: included.filter((row) => factsFor(row).startDate === null).length,
  }
}

export type CommissionReportDesk = {
  read(user: User, config: ReportConfig): Promise<CommissionReport>
}

const CACHE = new WeakMap<Repositories, CommissionReportDesk>()

export function commissionReportDesk(repositories: Repositories): CommissionReportDesk {
  const existing = CACHE.get(repositories)
  if (existing) return existing

  const built: CommissionReportDesk = {
    async read(user, config) {
      const [book, policyPage] = await Promise.all([
        // The commission desk applies §11's row-level scope before it chains
        // anything, so a placement this viewer may not read is never counted
        // here either. This report adds no scope of its own and weakens none.
        commissionDesk(repositories).book(user),
        repositories.policies.list({ page: 1, pageSize: SCAN_SIZE }),
      ])

      const policies = new Map(policyPage.rows.map((policy) => [policy.id, policy]))
      const facts = new Map<string, PlacementFacts>(
        book.rows.map((row) => {
          const policy = policies.get(row.policyId)
          return [
            row.policyId,
            {
              startDate: policy?.startDate ?? null,
              companyId: policy?.companyId ?? null,
            },
          ]
        }),
      )

      return buildCommissionReport(book.rows, facts, config, book.refusals.length)
    },
  }

  CACHE.set(repositories, built)
  return built
}
