/**
 * The reports desk — plan §5 "Reports": policy and claim summaries, renewal
 * buckets, year on year, birthdays.
 *
 * **The rule this whole module exists to keep: a report READS.** It counts rows
 * that are already on the books and it adds up amounts somebody already typed.
 * It does not compute a premium, a settlement, a refund or an endorsement delta,
 * and it does not project, forecast, annualise, extrapolate or estimate anything
 * (D3). Concretely, and each of these was a real temptation while writing it:
 *
 *   - "Premium recorded" is `sumMoney` over the `finalPremium` figures that
 *     EXIST. Policies without one are not treated as zero and are not filled in
 *     from Net plus GST — they are counted separately and reported as missing,
 *     so the total says what it covers;
 *   - the renewal buckets count policies by their recorded expiry date. There is
 *     no renewal premium in any bucket, because a renewal premium is a figure
 *     the insurer has not issued yet and inventing one is exactly the thing D3
 *     forbids;
 *   - year on year compares what was recorded in each year and reports the
 *     change in POLICY COUNT only. There is deliberately no percentage change on
 *     money and no run rate: two recorded sums sitting side by side is a
 *     comparison a person makes, a growth figure is a claim the platform would
 *     be making;
 *   - birthdays are a date read off a record. Nothing is derived but the day of
 *     the year.
 *
 * The only arithmetic anywhere below is addition, through `sumMoney` — the
 * domain's own function, which has no multiply, no divide and no percentage by
 * construction.
 *
 * Dates are compared as ISO strings rather than as `Date` objects. Every date on
 * these records is `YYYY-MM-DD`, string order is chronological order, and doing
 * it this way means a report cannot shift a policy into a different bucket
 * because of the reader's time zone.
 */

import type {
  Claim,
  Customer,
  Inquiry,
  InquiryStage,
  ListQuery,
  Policy,
  Repositories,
} from '../../../data/repo'
import { stageCountsAsOpen } from '../../../domain/workflows'
import { sumMoney, zero } from '../../../domain/money'
import type { Money } from '../../../domain/money'
import { can } from '../../../domain/permissions'
import type { ScopedRecord, User } from '../../../domain/permissions'
import { MODE_LABEL } from '../../renewals/renewal-view'
import { withinWindow } from '../report-params'
import type { ReportConfig } from '../report-params'

/** Big enough to hold the whole in-memory set; a report reads the book. */
const SCAN_SIZE = 10_000

const EVERYTHING: ListQuery = { page: 1, pageSize: SCAN_SIZE }

/* ------------------------------------------------------------------- scope */

/**
 * Reports are scope-tested like anything else.
 *
 * Every starter template that grants `reports` grants it at `level: 'all'`, so
 * today this filters nothing — which is exactly why it is here. The moment an
 * admin clones a template and narrows the scope, the figures narrow with it,
 * rather than a manager quietly reading the whole agency's book out of a screen
 * that was written when nobody had a narrow scope.
 */
function policyScope(policy: Policy): ScopedRecord {
  return {
    ...(policy.agentId === null ? {} : { agentId: policy.agentId }),
    ...(policy.subAgentId === null ? {} : { subAgentId: policy.subAgentId }),
    companyId: policy.companyId,
  }
}

function claimScope(claim: Claim): ScopedRecord {
  return {
    ...(claim.ownerId === null ? {} : { ownerId: claim.ownerId }),
    ...(claim.agentId === null ? {} : { agentId: claim.agentId }),
  }
}

function inquiryScope(inquiry: Inquiry): ScopedRecord {
  return {
    ...(inquiry.ownerId === null ? {} : { ownerId: inquiry.ownerId }),
    ...(inquiry.agentId === null ? {} : { agentId: inquiry.agentId }),
    ...(inquiry.subAgentId === null ? {} : { subAgentId: inquiry.subAgentId }),
  }
}

function customerScope(customer: Customer): ScopedRecord {
  return {
    ownerId: customer.ownerId,
    ...(customer.agentId === null ? {} : { agentId: customer.agentId }),
    ...(customer.subAgentId === null ? {} : { subAgentId: customer.subAgentId }),
  }
}

/* ------------------------------------------------------------- date helpers */

/** The reader's `now` as the same kind of string every record carries. */
export function isoDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** `2026-09-01` plus 30 days, still as a plain date. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * The Indian financial year a date falls in: April to March.
 *
 * Read off the string rather than a `Date`, so `2026-04-01` is FY 2026-27 for
 * every reader regardless of where they are sitting.
 */
export function financialYearOf(day: string): number {
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  return month >= 4 ? year : year - 1
}

export function financialYearLabel(year: number): string {
  return `FY ${year}-${String((year + 1) % 100).padStart(2, '0')}`
}

/** Month and day, for a birthday comparison that ignores the year. */
function monthDay(day: string): string {
  return day.slice(5, 10)
}

/* ------------------------------------------------------------ policy summary */

export type CountRow = {
  readonly key: string
  readonly label: string
  readonly count: number
}

export type PolicySummary = {
  readonly total: number
  readonly byStatus: readonly CountRow[]
  /**
   * The sum of the final premiums that HAVE been recorded. Never a projection,
   * and never Net plus GST filled in on a policy's behalf.
   */
  readonly recordedPremium: Money
  /** How many policies that total actually covers. */
  readonly premiumRecordedOn: number
  /** How many carry no final premium yet. Not zero — absent. */
  readonly premiumMissingOn: number
}

const POLICY_STATUS_LABEL: Readonly<Record<string, string>> = {
  draft: 'Draft',
  proposal: 'Proposal',
  sent: 'Sent to insurer',
  issued: 'Issued',
  declined: 'Declined',
  dispatched: 'Dispatched',
  documents_collected: 'Documents collected',
  closed: 'Closed',
  lapsed: 'Lapsed',
  locked: 'Locked',
}

export function policyStatusLabel(status: string): string {
  return POLICY_STATUS_LABEL[status] ?? status
}

/** The states a policy has to be in for its premium to be a real, issued figure. */
const PREMIUM_BEARING: readonly string[] = [
  'issued',
  'dispatched',
  'documents_collected',
  'closed',
  'locked',
]

function summarisePolicies(policies: readonly Policy[]): PolicySummary {
  const counts = new Map<string, number>()
  for (const policy of policies) {
    counts.set(policy.status, (counts.get(policy.status) ?? 0) + 1)
  }

  const live = policies.filter((policy) => PREMIUM_BEARING.includes(policy.status))
  const recorded = live
    .map((policy) => policy.finalPremium)
    .filter((amount): amount is Money => amount !== null)

  return {
    total: policies.length,
    byStatus: [...counts.entries()]
      .map(([status, count]) => ({ key: status, label: policyStatusLabel(status), count }))
      .sort((a, b) => b.count - a.count),
    recordedPremium: recorded.length === 0 ? zero() : sumMoney(recorded),
    premiumRecordedOn: recorded.length,
    premiumMissingOn: live.length - recorded.length,
  }
}

/* ------------------------------------------------------------- claim summary */

export type ClaimSummary = {
  readonly total: number
  readonly byState: readonly CountRow[]
  readonly open: number
  readonly closed: number
  /** The sum of the settlements the insurer's advice has already given us. */
  readonly recordedSettlement: Money
  readonly settlementRecordedOn: number
}

const CLAIM_STATE_LABEL: Readonly<Record<string, string>> = {
  raised: 'Raised',
  blocked: 'Blocked',
  intimated: 'Intimated',
  picked_up: 'Picked up',
  upload_link_sent: 'Upload link sent',
  summary_received: 'Summary received',
  tracked: 'Tracked',
  checklist_raised: 'Checklist raised',
  docs_collected: 'Documents collected',
  filed_with_insurer: 'Filed with insurer',
  query_open: 'Query open',
  settlement_recorded: 'Settlement recorded',
  closed: 'Closed',
}

export function claimStateLabel(state: string): string {
  return CLAIM_STATE_LABEL[state] ?? state
}

function summariseClaims(claims: readonly Claim[]): ClaimSummary {
  const counts = new Map<string, number>()
  for (const claim of claims) {
    counts.set(claim.state, (counts.get(claim.state) ?? 0) + 1)
  }

  const recorded = claims
    .map((claim) => claim.settlement.amount)
    .filter((amount): amount is Money => amount !== null)

  const closed = claims.filter((claim) => claim.state === 'closed').length

  return {
    total: claims.length,
    byState: [...counts.entries()]
      .map(([state, count]) => ({ key: state, label: claimStateLabel(state), count }))
      .sort((a, b) => b.count - a.count),
    open: claims.length - closed,
    closed,
    recordedSettlement: recorded.length === 0 ? zero() : sumMoney(recorded),
    settlementRecordedOn: recorded.length,
  }
}

/* ------------------------------------------------------------ renewal buckets */

export type RenewalBucket = CountRow & {
  /** Inclusive date range, as the policies carry it. Empty for the overdue bucket. */
  readonly from: string | null
  readonly to: string
  /** The queue address this bucket would open, once `/renewals` is built. */
  readonly address: string
}

const BUCKET_DAYS: readonly (readonly [string, string, number, number])[] = [
  ['d30', 'Expiring inside 30 days', 0, 30],
  ['d60', 'Expiring in 31 to 60 days', 31, 60],
  ['d90', 'Expiring in 61 to 90 days', 61, 90],
]

/** The states whose expiry date is a live renewal date rather than history. */
const RENEWABLE: readonly string[] = ['issued', 'dispatched', 'documents_collected']

function bucketRenewals(policies: readonly Policy[], today: string): readonly RenewalBucket[] {
  const live = policies.filter(
    (policy) => RENEWABLE.includes(policy.status) && policy.expiryDate !== null,
  )

  const expiredBefore = live.filter((policy) => (policy.expiryDate ?? '') < today)

  const buckets: RenewalBucket[] = [
    {
      key: 'overdue',
      label: 'Already past expiry',
      count: expiredBefore.length,
      from: null,
      to: addDays(today, -1),
      address: '/renewals',
    },
  ]

  for (const [key, label, fromDays, toDays] of BUCKET_DAYS) {
    const from = addDays(today, fromDays)
    const to = addDays(today, toDays)
    buckets.push({
      key,
      label,
      count: live.filter(
        (policy) => (policy.expiryDate ?? '') >= from && (policy.expiryDate ?? '') <= to,
      ).length,
      from,
      to,
      address: '/renewals',
    })
  }

  return buckets
}

/* ------------------------------------------------------------------- year on year */

export type YearRow = {
  readonly year: number
  readonly label: string
  readonly policies: number
  /** The sum of what was recorded that year. Not annualised, not projected. */
  readonly recordedPremium: Money
  readonly premiumRecordedOn: number
  /**
   * Policies written, this year against the one before. A count, deliberately:
   * there is no percentage on money anywhere in this product.
   */
  readonly changeInPolicies: number | null
}

function yearOnYear(policies: readonly Policy[], today: string): readonly YearRow[] {
  const current = financialYearOf(today)
  const years = [current - 2, current - 1, current]

  const rows = years.map((year) => {
    const written = policies.filter(
      (policy) => policy.startDate !== null && financialYearOf(policy.startDate) === year,
    )
    const recorded = written
      .map((policy) => policy.finalPremium)
      .filter((amount): amount is Money => amount !== null)

    return {
      year,
      label: financialYearLabel(year),
      policies: written.length,
      recordedPremium: recorded.length === 0 ? zero() : sumMoney(recorded),
      premiumRecordedOn: recorded.length,
      changeInPolicies: null as number | null,
    }
  })

  return rows.map((row, index) =>
    index === 0 ? row : { ...row, changeInPolicies: row.policies - rows[index - 1].policies },
  )
}

/* --------------------------------------------------------------- birthdays */

export type Birthday = {
  readonly customerId: string
  readonly name: string
  readonly dateOfBirth: string
  /** `MM-DD`, which is what the window is tested on. */
  readonly monthDay: string
  readonly mobile: string
  readonly ownerId: string
}

/** How far ahead the birthday list looks. A month is what a greeting run needs. */
export const BIRTHDAY_WINDOW_DAYS = 30

/**
 * Birthdays inside the window, ignoring the year.
 *
 * The window is built as a set of `MM-DD` keys rather than as a range, which is
 * what makes it wrap across the new year without a special case — 28 December
 * and 3 January sit in the same run.
 *
 * Members are not included. A member's birthday needs a per-customer read and
 * `MemberRepository` has no cross-customer list; when one exists this is where
 * they join. The list says so on screen rather than quietly being short.
 */
function birthdaysWithin(
  customers: readonly Customer[],
  today: string,
  days: number,
): readonly Birthday[] {
  const window = new Set<string>()
  for (let offset = 0; offset <= days; offset += 1) window.add(monthDay(addDays(today, offset)))

  const order = [...window]

  return customers
    .filter(
      (customer): customer is Customer & { dateOfBirth: string } =>
        customer.dateOfBirth !== null && window.has(monthDay(customer.dateOfBirth)),
    )
    .map((customer) => ({
      customerId: customer.id,
      name: customer.fullName,
      dateOfBirth: customer.dateOfBirth,
      monthDay: monthDay(customer.dateOfBirth),
      mobile: customer.mobile,
      ownerId: customer.ownerId,
    }))
    .sort((a, b) => order.indexOf(a.monthDay) - order.indexOf(b.monthDay))
}

/* -------------------------------------------------------------- the pipeline */

export type PipelineRow = {
  readonly stageKey: string
  readonly label: string
  readonly count: number
  /**
   * The middle inquiry's age in this stage, in days. A median rather than a mean
   * because one lead sitting for ninety days drags an average into saying the
   * whole stage is stale when nine of the ten in it are a day old.
   */
  readonly medianDaysInStage: number | null
  /** How many of these carry a dated next action. The coverage rule, per stage. */
  readonly withNextAction: number
  /** How many are past the date they were given. */
  readonly overdue: number
}

export type PipelineSummary = {
  readonly rows: readonly PipelineRow[]
  /** Accepted and still being worked, however the stages are configured. */
  readonly open: number
  /** Of those, how many carry a dated next action — the KPI, as a count. */
  readonly withNextAction: number
  readonly overdue: number
  /**
   * Accepted, open, and nobody has ever planned anything. Reported separately
   * from `overdue` because it is a different fault: an overdue action is a
   * promise missed, and this is a promise never made.
   */
  readonly unplanned: number
  /** Open inquiries nobody has logged a single contact against. */
  readonly neverContacted: number
}

/**
 * The pipeline, counted — FR-06.19.
 *
 * The counting rule is the same one the rest of this module lives by: it reads
 * what is on the records. There is no conversion probability, no expected value
 * and no forecast of what the stage will produce, because every one of those is
 * a number the agency would start making decisions on and nobody typed it.
 *
 * What it does say is the thing the platform could not say before: of the
 * inquiries somebody accepted and is supposedly working, how many have a next
 * thing with a date on it. §3.2's "% confirmed within TAT" cannot tell you that,
 * and can read 100% while nobody has rung a single customer.
 */
export function summarisePipeline(
  inquiries: readonly Inquiry[],
  stages: readonly InquiryStage[],
  contactedIds: ReadonlySet<string>,
  now: Date,
): PipelineSummary {
  const open = inquiries.filter(
    (inquiry) => inquiry.status === 'accepted' && stageCountsAsOpen(stages, inquiry.stageKey),
  )
  const at = now.getTime()
  const isOverdue = (inquiry: Inquiry) =>
    inquiry.nextActionAt !== null && new Date(inquiry.nextActionAt).getTime() < at

  const rows = stages
    .filter((stage) => stage.active)
    .map((stage) => {
      const held = inquiries.filter(
        (inquiry) => inquiry.status === 'accepted' && inquiry.stageKey === stage.key,
      )
      const ages = held
        .map((inquiry) => inquiry.stageEnteredAt)
        .filter((entered): entered is string => entered !== null)
        .map((entered) => Math.floor((at - new Date(entered).getTime()) / 86_400_000))
        .sort((a, b) => a - b)

      return {
        stageKey: stage.key,
        label: stage.label,
        count: held.length,
        medianDaysInStage: ages.length === 0 ? null : ages[Math.floor(ages.length / 2)],
        withNextAction: held.filter((inquiry) => inquiry.nextActionAt !== null).length,
        overdue: held.filter(isOverdue).length,
      }
    })

  // Accepted but not yet in any stage is a real population, not a gap: it is
  // every inquiry somebody took on and has not yet rung. Leaving it out of the
  // board would hide exactly the rows the board was built to surface.
  const unstaged = open.filter((inquiry) => inquiry.stageKey === null)
  const allRows =
    unstaged.length === 0
      ? rows
      : [
          {
            stageKey: '',
            label: 'Not contacted',
            count: unstaged.length,
            medianDaysInStage: null,
            withNextAction: unstaged.filter((inquiry) => inquiry.nextActionAt !== null).length,
            overdue: unstaged.filter(isOverdue).length,
          },
          ...rows,
        ]

  return {
    rows: allRows,
    open: open.length,
    withNextAction: open.filter((inquiry) => inquiry.nextActionAt !== null).length,
    overdue: open.filter(isOverdue).length,
    unplanned: open.filter((inquiry) => inquiry.nextActionAt === null).length,
    neverContacted: open.filter((inquiry) => !contactedIds.has(inquiry.id)).length,
  }
}

/* ------------------------------------------- the policy book, parameterised */

/**
 * One grouped line of the policy summary.
 *
 * Same three money facts as the summary itself, per group: what was recorded,
 * how many policies that covers, and how many it does not. A group's total
 * covering four of its nine policies has to say so, or the column reads as the
 * group's whole premium.
 */
export type PolicyGroupRow = {
  readonly key: string
  readonly label: string
  readonly policies: number
  readonly recordedPremium: Money
  readonly premiumRecordedOn: number
  readonly premiumMissingOn: number
}

export type PolicyBook = {
  readonly windowLabel: string
  readonly groupLabel: string
  readonly rows: readonly PolicyGroupRow[]
  /** The same figures over every row in the window, built from the same set. */
  readonly summary: PolicySummary
  /** Policies the period or the company filter left out of the figures above. */
  readonly excluded: number
  /**
   * Policies inside the company filter with no recorded start date. They fall
   * outside every bounded period, which is stated rather than left to be noticed
   * as a total that does not add up against the unbounded view.
   */
  readonly undated: number
}

const POLICY_GROUP_LABELS: Readonly<Record<string, string>> = {
  status: 'Policy state',
  company: 'Insurance company',
  mode: 'Premium mode',
}

/**
 * The policy summary, grouped and narrowed. Pure, so the grouping can be driven
 * from a test without a repository.
 *
 * The window is tested against the recorded START DATE — the day cover began,
 * which is when the business was written. A policy with no start date recorded
 * is outside every bounded period and inside the unbounded one, the same rule
 * the commission report keeps, and for the same reason: a date nobody typed must
 * not quietly land in every answer.
 */
export function buildPolicyBook(
  policies: readonly Policy[],
  config: ReportConfig,
  companyNames: ReadonlyMap<string, string>,
  modeLabels: Readonly<Record<string, string>>,
): PolicyBook {
  const inCompany =
    config.companyId === null
      ? policies
      : policies.filter((policy) => policy.companyId === config.companyId)

  const bounded = config.window.from !== null || config.window.to !== null
  const included = bounded
    ? inCompany.filter((policy) => withinWindow(policy.startDate, config.window))
    : inCompany

  const buckets = new Map<string, { label: string; rows: Policy[] }>()
  for (const policy of included) {
    const keyed =
      config.group === 'company'
        ? {
            key: policy.companyId,
            label: companyNames.get(policy.companyId) ?? 'Company not on file',
          }
        : config.group === 'mode'
          ? { key: policy.premiumMode, label: modeLabels[policy.premiumMode] ?? policy.premiumMode }
          : { key: policy.status, label: policyStatusLabel(policy.status) }

    const bucket = buckets.get(keyed.key)
    if (bucket) bucket.rows.push(policy)
    else buckets.set(keyed.key, { label: keyed.label, rows: [policy] })
  }

  const rows = [...buckets.entries()]
    .map(([key, bucket]) => {
      const summary = summarisePolicies(bucket.rows)
      return {
        key,
        label: bucket.label,
        policies: bucket.rows.length,
        recordedPremium: summary.recordedPremium,
        premiumRecordedOn: summary.premiumRecordedOn,
        premiumMissingOn: summary.premiumMissingOn,
      }
    })
    .sort((a, b) => b.policies - a.policies || a.label.localeCompare(b.label))

  return {
    windowLabel: config.window.label,
    groupLabel: POLICY_GROUP_LABELS[config.group] ?? POLICY_GROUP_LABELS.status,
    rows,
    summary: summarisePolicies(included),
    excluded: policies.length - included.length,
    undated: inCompany.filter((policy) => policy.startDate === null).length,
  }
}

/* ------------------------------------------------------------------ the desk */

export type ReportSet = {
  /** The day every date comparison on this board was made against. */
  readonly asOf: string
  readonly policies: PolicySummary
  readonly claims: ClaimSummary
  readonly renewals: readonly RenewalBucket[]
  readonly years: readonly YearRow[]
  readonly birthdays: readonly Birthday[]
  readonly pipeline: PipelineSummary
}

export type ReportsDesk = {
  read(user: User, now: Date): Promise<ReportSet>
  /** The policy summary under this report's parameters — FR-19.5. */
  policyBook(user: User, config: ReportConfig): Promise<PolicyBook>
}

const CACHE = new WeakMap<Repositories, ReportsDesk>()

export function reportsDesk(repositories: Repositories): ReportsDesk {
  const existing = CACHE.get(repositories)
  if (existing) return existing
  const built = buildDesk(repositories)
  CACHE.set(repositories, built)
  return built
}

function buildDesk(repositories: Repositories): ReportsDesk {
  return {
    async read(user, now) {
      const today = isoDay(now)

      const [policyPage, claimPage, customerPage, inquiryPage, stages, activityPage] =
        await Promise.all([
          repositories.policies.list(EVERYTHING),
          repositories.claims.list(EVERYTHING),
          repositories.customers.list(EVERYTHING),
          repositories.inquiries.list(EVERYTHING),
          repositories.config.inquiryStages(),
          repositories.activities.list(EVERYTHING),
        ])

      const policies = policyPage.rows.filter((policy) =>
        can(user, 'view', 'reports', policyScope(policy)),
      )
      const claims = claimPage.rows.filter((claim) =>
        can(user, 'view', 'reports', claimScope(claim)),
      )
      const customers = customerPage.rows.filter((customer) =>
        can(user, 'view', 'reports', customerScope(customer)),
      )
      const inquiries = inquiryPage.rows.filter((inquiry) =>
        can(user, 'view', 'reports', inquiryScope(inquiry)),
      )
      // Which inquiries anybody has actually spoken to. Ids only — the report
      // counts contacts, and what was said is none of its business.
      const contacted = new Set(
        activityPage.rows
          .filter((activity) => activity.subjectEntity === 'Inquiry')
          .map((activity) => activity.subjectId),
      )

      return {
        asOf: today,
        policies: summarisePolicies(policies),
        claims: summariseClaims(claims),
        renewals: bucketRenewals(policies, today),
        years: yearOnYear(policies, today),
        birthdays: birthdaysWithin(customers, today, BIRTHDAY_WINDOW_DAYS),
        pipeline: summarisePipeline(inquiries, stages, contacted, now),
      }
    },

    async policyBook(user, config) {
      const [policyPage, companyPage] = await Promise.all([
        repositories.policies.list(EVERYTHING),
        repositories.companies.list(EVERYTHING),
      ])

      const policies = policyPage.rows.filter((policy) =>
        can(user, 'view', 'reports', policyScope(policy)),
      )
      const companyNames = new Map(
        companyPage.rows.map((company) => [company.id, company.shortName]),
      )

      return buildPolicyBook(policies, config, companyNames, MODE_LABEL)
    },
  }
}
