/**
 * The premium calendar — FR-19.2, "what falls due, and when".
 *
 * ---------------------------------------------------------------------------
 * The one rule that shapes this whole file
 * ---------------------------------------------------------------------------
 *
 * **Nothing here divides an annual premium.** The amount on a row is
 * `InstalmentDue.amount`, which the schedule was created with, which the
 * insurer's own schedule was typed from — `PremiumSchedule.instalmentAmount`
 * carries an `InstalmentAmountSource` precisely so a figure derived from an
 * annual premium can be refused as data. A "premium calendar" is exactly the
 * screen where somebody would be tempted to spread a yearly figure across twelve
 * months to fill the empty columns, and the empty columns stay empty.
 *
 * The only arithmetic below is `sumMoney` over amounts that already exist.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately NOT in the calendar
 * ---------------------------------------------------------------------------
 *
 * A policy paid in one go has no instalment schedule, so it contributes no row.
 * That is a real hole in the answer and the screen says so out loud rather than
 * quietly reading as "nothing falls due in March". Single-premium and annual
 * business shows up on Renewal buckets, on the expiry date the insurer recorded,
 * which is the other clock and a different question.
 *
 * ---------------------------------------------------------------------------
 * Consistency with `/renewals/instalments`
 * ---------------------------------------------------------------------------
 *
 * The instalment queue reasons about dues, grace and failed mandates row by row,
 * and it owns that reasoning. This module borrows its vocabulary — the same
 * `INSTALMENT_LABEL` map, the same `OPEN_INSTALMENT_STATES` definition of what
 * counts as work — rather than restating it, so a month that reads "4 due" here
 * cannot mean something different from the four rows over there. The calendar
 * counts and totals; it decides nothing about grace.
 */

import { sumMoney, zero } from '../../../domain/money'
import type { Money } from '../../../domain/money'
import { can } from '../../../domain/permissions'
import type { ScopedRecord, User } from '../../../domain/permissions'
import type { Company, InstalmentDue, Policy, Repositories } from '../../../data/repo'
import { INSTALMENT_LABEL, OPEN_INSTALMENT_STATES } from '../../renewals/renewal-view'
import type { ReportConfig } from '../report-params'

const SCAN_SIZE = 10_000

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** `2026-11` to `November 2026`. Read off the string, so no time zone can shift it. */
export function monthLabel(month: string): string {
  const year = month.slice(0, 4)
  const index = Number(month.slice(5, 7)) - 1
  const name = MONTH_NAMES[index]
  return name === undefined ? month : `${name} ${year}`
}

/** One row of the calendar: a bucket, what falls due in it, and how much of it is work. */
export type CalendarRow = {
  readonly key: string
  readonly label: string
  readonly instalments: number
  /** The sum of the amounts recorded on those instalments. */
  readonly amount: Money
  /** How many of them carry an amount at all. A schedule row without one is absent, not zero. */
  readonly amountRecordedOn: number
  /** Due, missed, in grace or grace expired — the states somebody has to act on. */
  readonly needingAction: number
  /** How many policies those instalments belong to. */
  readonly policies: number
}

export type PremiumCalendar = {
  readonly window: { readonly from: string; readonly to: string }
  readonly groupLabel: string
  readonly rows: readonly CalendarRow[]
  readonly total: CalendarRow
  /** Policies in force with no instalment schedule at all. The honest hole. */
  readonly policiesWithoutSchedule: number
}

function policyScope(policy: Policy): ScopedRecord {
  return {
    ...(policy.agentId === null ? {} : { agentId: policy.agentId }),
    ...(policy.subAgentId === null ? {} : { subAgentId: policy.subAgentId }),
    companyId: policy.companyId,
  }
}

/** Policies whose term is running, and which therefore could carry a schedule. */
const IN_FORCE: readonly string[] = ['issued', 'dispatched', 'documents_collected']

const GROUP_LABELS: Readonly<Record<string, string>> = {
  month: 'Month due',
  company: 'Insurance company',
  state: 'Instalment state',
}

function rowFor(key: string, label: string, dues: readonly InstalmentDue[]): CalendarRow {
  const recorded = dues.map((due) => due.amount).filter((amount): amount is Money => amount !== null)

  return {
    key,
    label,
    instalments: dues.length,
    amount: recorded.length === 0 ? zero() : sumMoney(recorded),
    amountRecordedOn: recorded.length,
    needingAction: dues.filter((due) =>
      (OPEN_INSTALMENT_STATES as readonly string[]).includes(due.state),
    ).length,
    policies: new Set(dues.map((due) => due.policyId)).size,
  }
}

/**
 * The calendar, grouped.
 *
 * Pure, and separated from the read so a test can hand it rows and assert the
 * total equals the sum of them. Ordering is by key ascending for a month, which
 * is chronological because `YYYY-MM` sorts that way, and by size descending for
 * the other two, because a company or a state is read by which is biggest.
 */
export function buildCalendar(
  dues: readonly InstalmentDue[],
  group: string,
  companies: ReadonlyMap<string, string>,
  policyCompany: ReadonlyMap<string, string>,
  window: { readonly from: string; readonly to: string },
  policiesWithoutSchedule: number,
): PremiumCalendar {
  const buckets = new Map<string, { label: string; dues: InstalmentDue[] }>()

  for (const due of dues) {
    let key: string
    let label: string

    if (group === 'company') {
      const companyId = policyCompany.get(due.policyId) ?? ''
      key = companyId
      label = companies.get(companyId) ?? 'Company not on file'
    } else if (group === 'state') {
      key = due.state
      label = INSTALMENT_LABEL[due.state] ?? due.state
    } else {
      key = due.dueDate.slice(0, 7)
      label = monthLabel(key)
    }

    const bucket = buckets.get(key)
    if (bucket) bucket.dues.push(due)
    else buckets.set(key, { label, dues: [due] })
  }

  const rows = [...buckets.entries()].map(([key, bucket]) => rowFor(key, bucket.label, bucket.dues))
  const ordered =
    group === 'month'
      ? rows.sort((a, b) => a.key.localeCompare(b.key))
      : rows.sort((a, b) => b.instalments - a.instalments || a.label.localeCompare(b.label))

  return {
    window,
    groupLabel: GROUP_LABELS[group] ?? GROUP_LABELS.month,
    rows: ordered,
    // The total is built from the SAME rows the table shows, not from a second
    // pass over the source. Two reads of one set is how a total comes to
    // disagree with the column above it.
    total: rowFor('total', 'Everything in this window', dues),
    policiesWithoutSchedule,
  }
}

export type PremiumCalendarDesk = {
  read(user: User, config: ReportConfig): Promise<PremiumCalendar>
  companies(): Promise<readonly Company[]>
}

const CACHE = new WeakMap<Repositories, PremiumCalendarDesk>()

export function premiumCalendarDesk(repositories: Repositories): PremiumCalendarDesk {
  const existing = CACHE.get(repositories)
  if (existing) return existing
  const built = buildDesk(repositories)
  CACHE.set(repositories, built)
  return built
}

function buildDesk(repositories: Repositories): PremiumCalendarDesk {
  return {
    async companies() {
      const page = await repositories.companies.list({ page: 1, pageSize: SCAN_SIZE })
      return page.rows
    },

    async read(user, config) {
      // Every period this report offers is bounded — a calendar with no end is
      // not a calendar — so the window always resolves to two dates.
      const from = config.window.from ?? config.window.to ?? ''
      const to = config.window.to ?? from

      const [dues, policyPage, companyPage] = await Promise.all([
        repositories.schedules.dueBetween(from, to),
        repositories.policies.list({ page: 1, pageSize: SCAN_SIZE }),
        repositories.companies.list({ page: 1, pageSize: SCAN_SIZE }),
      ])

      const readable = policyPage.rows.filter((policy) =>
        can(user, 'view', 'reports', policyScope(policy)),
      )
      const byId = new Map(readable.map((policy) => [policy.id, policy]))

      const inScope = dues.filter((due) => {
        const policy = byId.get(due.policyId)
        if (policy === undefined) return false
        if (config.companyId !== null && policy.companyId !== config.companyId) return false
        return true
      })

      const policyCompany = new Map(readable.map((policy) => [policy.id, policy.companyId]))
      const companies = new Map(companyPage.rows.map((company) => [company.id, company.shortName]))

      const scheduled = new Set(dues.map((due) => due.policyId))
      const withoutSchedule = readable.filter(
        (policy) =>
          IN_FORCE.includes(policy.status) &&
          !scheduled.has(policy.id) &&
          (config.companyId === null || policy.companyId === config.companyId),
      ).length

      return buildCalendar(
        inScope,
        config.group,
        companies,
        policyCompany,
        { from, to },
        withoutSchedule,
      )
    },
  }
}
