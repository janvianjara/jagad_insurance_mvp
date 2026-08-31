/**
 * Everything `/reports` indexes, as a catalogue — FR-19.
 *
 * `/reports` is an index and `/reports/:key` is one entry, so the key set is the
 * route contract: an address is valid exactly when it is in this list, and a URL
 * naming anything else lands on an honest refusal rather than a blank page.
 *
 * ---------------------------------------------------------------------------
 * A register and a report are different things, and they look different
 * ---------------------------------------------------------------------------
 *
 * A REGISTER is the authoritative list of records of one kind. It is meant to be
 * scanned, narrowed and taken away, so it is a `<WorkQueue>` configured — the
 * same table, the same filter bar, the same URL state as every other list in the
 * product. A person opening the endorsement register is looking for a row.
 *
 * A REPORT is an answer to a question, and it has a shape: a period, a
 * comparison, a total. It is not a list at all, so rendering it as one would be
 * a lie about what it is. A person opening the premium calendar is not looking
 * for a row; they are asking how much falls due in November.
 *
 * `shape` is what the route dispatches on, which is why the two never drift into
 * looking the same.
 *
 * ---------------------------------------------------------------------------
 * Sections, because a person picking a report is choosing a question
 * ---------------------------------------------------------------------------
 *
 * Twelve names in a flat list is a menu nobody reads. The index groups them the
 * way an agency thinks about itself — the book, the pipeline, servicing, money —
 * and every entry leads with the QUESTION it answers rather than with its title.
 *
 * ---------------------------------------------------------------------------
 * `reads` and `never`, on screen
 * ---------------------------------------------------------------------------
 *
 * Every entry carries a `reads` line and a `never` line, and they are on screen
 * rather than only in this file. That is deliberate. The single most likely way
 * this product breaks its record-only rule is somebody adding a helpful
 * projection to a report — "expected renewal premium", "run rate", "estimated
 * settlement" — so each report states in the interface what it reads and what it
 * refuses to work out. A figure nobody typed has nowhere to hide.
 */

import type { IconName } from '../../ui/Icon'
import { PERIODS } from './report-params'
import type { ReportParameterSpec } from './report-params'

export const REPORT_KEYS = {
  policies: 'policies',
  claims: 'claims',
  renewals: 'renewals',
  yoy: 'yoy',
  birthdays: 'birthdays',
  pipeline: 'pipeline',
  portfolio: 'portfolio',
  endorsements: 'endorsements',
  premiumCalendar: 'premium-calendar',
  commission: 'commission',
} as const

export type ReportKey = (typeof REPORT_KEYS)[keyof typeof REPORT_KEYS]

/** What a thing IS, and therefore how it is drawn. */
export const REPORT_SHAPES = {
  report: 'report',
  register: 'register',
} as const

export type ReportShape = (typeof REPORT_SHAPES)[keyof typeof REPORT_SHAPES]

/** The four things an agency asks about itself. */
export const REPORT_SECTIONS = {
  book: 'book',
  pipeline: 'pipeline',
  servicing: 'servicing',
  money: 'money',
} as const

export type ReportSection = (typeof REPORT_SECTIONS)[keyof typeof REPORT_SECTIONS]

export type ReportSectionDefinition = {
  readonly key: ReportSection
  readonly title: string
  /** What the whole section is about, in the words a person would use. */
  readonly blurb: string
}

export const SECTIONS: readonly ReportSectionDefinition[] = [
  {
    key: REPORT_SECTIONS.book,
    title: 'The book',
    blurb: 'What the agency holds, who holds it, and what falls due.',
  },
  {
    key: REPORT_SECTIONS.pipeline,
    title: 'The pipeline',
    blurb: 'What has not been written yet, and whether anybody is working it.',
  },
  {
    key: REPORT_SECTIONS.servicing,
    title: 'Servicing',
    blurb: 'Claims, endorsements and renewals — the work a policy makes after it is issued.',
  },
  {
    key: REPORT_SECTIONS.money,
    title: 'Money',
    blurb: 'What the book earned, by period, by party and by source.',
  },
]

export type ReportDefinition = ReportParameterSpec & {
  readonly key: ReportKey
  readonly shape: ReportShape
  readonly section: ReportSection
  readonly title: string
  /**
   * The question this answers, asked the way a person asks it. The index leads
   * with this rather than with the title, because somebody picking a report is
   * picking a question, not a noun.
   */
  readonly question: string
  /** One line: what the report is for. */
  readonly summary: string
  /** The recorded facts it counts or adds up. */
  readonly reads: string
  /** What it deliberately does not work out. */
  readonly never: string
  readonly icon: IconName
}

export const REPORTS: readonly ReportDefinition[] = [
  /* ------------------------------------------------------------- the book */
  {
    key: REPORT_KEYS.portfolio,
    shape: REPORT_SHAPES.register,
    section: REPORT_SECTIONS.book,
    title: 'Client portfolio',
    question: 'What does this customer hold, with whom, and what is outstanding?',
    summary:
      'One row per customer: how many policies, across which companies, renewing when, with what still open against them.',
    reads:
      'Policies held per customer with the premiums already recorded on them, the earliest recorded expiry, and the count of claims, endorsements and unsettled payments open against that customer.',
    never:
      'It shows no Aadhaar number — the last four digits at most, as everywhere else — and it works out no lifetime value, no propensity and no renewal premium.',
    icon: 'users',
  },
  {
    key: REPORT_KEYS.premiumCalendar,
    shape: REPORT_SHAPES.report,
    section: REPORT_SECTIONS.book,
    title: 'Premium calendar',
    question: 'How much falls due, and in which month?',
    summary: 'Instalments falling due across the book, month by month, on the schedules the insurers issued.',
    reads:
      'Instalments the insurer scheduled, with the amount typed onto that schedule, grouped by the month they fall due in.',
    never:
      'It divides no annual premium by twelve and forecasts no collection. A policy paid in one go carries no schedule and does not appear here at all.',
    icon: 'calendar',
    periods: [PERIODS.next90, PERIODS.next180, PERIODS.next365, PERIODS.fyCurrent],
    groupings: [
      { value: 'month', label: 'Month due' },
      { value: 'company', label: 'Insurance company' },
      { value: 'state', label: 'Instalment state' },
    ],
    companyFilter: true,
  },
  {
    key: REPORT_KEYS.policies,
    shape: REPORT_SHAPES.report,
    section: REPORT_SECTIONS.book,
    title: 'Policy summary',
    question: 'Where does the book stand, and what has been recorded against it?',
    summary: 'How many policies are in each state, and the premium already typed in.',
    reads:
      'A count per group, and the sum of the final premiums already recorded on issued policies written inside the period.',
    never:
      'It does not work out a premium. A policy with no final premium recorded is counted as missing one, never as zero and never as Net plus GST.',
    icon: 'shield',
    periods: [PERIODS.all, PERIODS.fyCurrent, PERIODS.fyPrevious, PERIODS.fyBefore],
    groupings: [
      { value: 'status', label: 'Policy state' },
      { value: 'company', label: 'Insurance company' },
      { value: 'mode', label: 'Premium mode' },
    ],
    companyFilter: true,
  },
  {
    key: REPORT_KEYS.yoy,
    shape: REPORT_SHAPES.report,
    section: REPORT_SECTIONS.book,
    title: 'Year on year',
    question: 'Are we writing more than we did last year?',
    summary: 'Three financial years side by side, on what was actually written in each.',
    reads: 'Policies written per financial year by their recorded start date, with the premium recorded in that year.',
    never:
      'It reports the change in policy COUNT and nothing else. There is no percentage change on money, no run rate and no forecast.',
    icon: 'chart',
    parameterNote:
      'This report takes no period: three financial years side by side IS its shape, and a period control would only hide one of them. Narrow the book itself on Policy summary instead.',
  },

  /* --------------------------------------------------------- the pipeline */
  {
    key: REPORT_KEYS.pipeline,
    shape: REPORT_SHAPES.report,
    section: REPORT_SECTIONS.pipeline,
    title: 'Inquiry pipeline',
    question: 'Where has every open inquiry got to, and is anybody working it?',
    summary:
      'Where every open inquiry has got to, how long it has been there, and how many have a next thing booked.',
    reads:
      'A count per configured stage, the median days each has been in it, and how many carry a dated next action. Ages come from the stage-entered stamp on the record.',
    never:
      'It does not put a probability, an expected value or a forecast on any stage. A conversion rate the platform worked out is a number somebody would act on, and nobody typed it.',
    icon: 'chart',
    parameterNote:
      'This report takes no period. Every figure on it is measured against today — how long a lead has sat, whether its next action has passed — and there is no second date on an inquiry to run a period against.',
  },

  /* ---------------------------------------------------------- servicing */
  {
    key: REPORT_KEYS.endorsements,
    shape: REPORT_SHAPES.register,
    section: REPORT_SECTIONS.servicing,
    title: 'Endorsement register',
    question: 'What has been endorsed on this book, and how did each one end?',
    summary:
      'Every endorsement ever raised, with its type, its policy, its dates, both numbers and the decision taken on it.',
    reads:
      'The endorsement record: type, state, effective date, our reference and the insurer’s, who approved it and when, and the delta or refund typed off the insurer’s advice.',
    never:
      'It subtracts no premiums to arrive at a delta and pro-rates no refund. A non-financial endorsement carries no money column at all.',
    icon: 'edit',
  },
  {
    key: REPORT_KEYS.claims,
    shape: REPORT_SHAPES.report,
    section: REPORT_SECTIONS.servicing,
    title: 'Claim summary',
    question: 'What is the claims desk carrying, and what have the insurers settled?',
    summary: 'What the claims desk is carrying, and what the insurers have settled.',
    reads: 'A count per claim state, and the sum of the settlement amounts taken from insurers’ advices.',
    never:
      'It does not estimate a settlement, a reserve or a likely payout. A claim without a recorded settlement contributes nothing to the total.',
    icon: 'folder',
    parameterNote:
      'This report takes no period. A claim record carries no single date the whole desk can be counted against — intimation, filing and settlement are three different clocks — so a period control here would answer a question nobody asked.',
  },
  {
    key: REPORT_KEYS.renewals,
    shape: REPORT_SHAPES.report,
    section: REPORT_SECTIONS.servicing,
    title: 'Renewal buckets',
    question: 'How much of the book expires in the next ninety days?',
    summary: 'Policies by how close their recorded expiry date is.',
    reads: 'A count of live policies whose expiry date falls past, inside 30 days, 31 to 60, or 61 to 90.',
    never:
      'It carries no money at all. A renewal premium is a figure the insurer has not issued yet, so there is nothing here to total.',
    icon: 'clock',
    parameterNote:
      'This report takes no period: past, 30, 60 and 90 days from today ARE the buckets, and a period control would only restate them. The renewal pool is where those policies are worked.',
  },
  {
    key: REPORT_KEYS.birthdays,
    shape: REPORT_SHAPES.report,
    section: REPORT_SECTIONS.servicing,
    title: 'Birthdays',
    question: 'Whose birthday should somebody mark this month?',
    summary: 'Customers with a birthday in the next thirty days.',
    reads: 'The date of birth recorded on the customer, compared on day and month only.',
    never:
      'It sends nothing. A greeting is an outward message and goes out through the templates in configuration, behind a confirm.',
    icon: 'users',
    parameterNote:
      'This list takes no period. Thirty days ahead is what a greeting run needs, and a birthday is compared on day and month only, so a financial year means nothing to it.',
  },

  /* -------------------------------------------------------------- money */
  {
    key: REPORT_KEYS.commission,
    shape: REPORT_SHAPES.report,
    section: REPORT_SECTIONS.money,
    title: 'Commission earned',
    question: 'What did the book earn, and how much of it did we keep?',
    summary:
      'The commission chain rolled up by period, by party and by source: what came in, what went out to agents, and what the agency kept.',
    reads:
      'The chain §9 reckons from the percentages in configuration, per issued policy, rolled up by addition alone. Placements outside your scope are never chained and never counted.',
    never:
      'It applies no rate of its own and reconciles nothing against an insurer statement. Where a statement figure exists it is shown beside the computed pay-in on the ledger, and neither is subtracted from the other.',
    icon: 'coin',
    periods: [PERIODS.all, PERIODS.fyCurrent, PERIODS.fyPrevious, PERIODS.fyBefore],
    groupings: [
      { value: 'source', label: 'Source of business' },
      { value: 'company', label: 'Insurance company' },
      { value: 'agent', label: 'Agent' },
      { value: 'year', label: 'Financial year' },
    ],
    companyFilter: true,
  },
]

export function reportDefinition(key: string | undefined): ReportDefinition | undefined {
  return REPORTS.find((report) => report.key === key)
}

export function reportsInSection(section: ReportSection): readonly ReportDefinition[] {
  return REPORTS.filter((report) => report.section === section)
}

/** True when the entry offers at least one real control. */
export function hasParameters(definition: ReportDefinition): boolean {
  return (
    (definition.periods?.length ?? 0) > 0 ||
    (definition.groupings?.length ?? 0) > 0 ||
    definition.companyFilter === true
  )
}
