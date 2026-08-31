/**
 * A report's parameters, and the URL they live in — FR-19.5.
 *
 * Pure: no React, no repository, no DOM beyond `URLSearchParams`, which is a
 * plain codec rather than a browser dependency.
 *
 * The constitution's rule is that URL owns list state, and a report is a list
 * state in every way that matters: a period, a grouping, a filter. So the three
 * controls a report offers write here and read back out of here, and nothing
 * about what a report is showing is held anywhere else. That is what makes a
 * report shareable — the whole point of a report — and it is the same rule
 * `queue-url.ts` keeps for a queue, in a smaller shape because a report has no
 * page, no sort and no selection.
 *
 * Two decisions that are easy to get wrong:
 *
 *   A period is a NAMED PRESET in the URL, not a pair of dates. `?period=fy-2025`
 *   still reads as the same financial year next March, whereas a copied
 *   `?from=2025-04-01&to=2026-03-31` silently becomes last year's report. The
 *   preset resolves to a window at read time, against the day the reader is on.
 *
 *   An unknown value falls back to the report's own default rather than
 *   throwing. A report URL is the kind of thing people paste into a message and
 *   edit by hand, and a mistyped grouping should show the report, not an error.
 *   A queue filter throws on an undeclared key because a filter that quietly
 *   does nothing is a count nobody can reconcile; here the control shows what it
 *   actually resolved to, so nothing is quiet about it.
 *
 * Nothing in this file computes money, and nothing in it produces a figure. It
 * decides which recorded rows a report is looking at, and no more than that.
 */

/** The URL parameter names a report owns. */
export const REPORT_PARAMS = {
  period: 'period',
  group: 'group',
  company: 'company',
} as const

export type ReportParam = (typeof REPORT_PARAMS)[keyof typeof REPORT_PARAMS]

/**
 * The period presets a report may offer.
 *
 * Financial years are April to March, the way the rest of this module already
 * reads them. The forward horizons exist for the premium calendar, which looks
 * ahead at dues rather than back at what was written.
 */
export const PERIODS = {
  fyCurrent: 'fy-current',
  fyPrevious: 'fy-previous',
  fyBefore: 'fy-before',
  next90: 'next-90',
  next180: 'next-180',
  next365: 'next-365',
  all: 'all',
} as const

export type PeriodKey = (typeof PERIODS)[keyof typeof PERIODS]

export const PERIOD_LABELS: Readonly<Record<PeriodKey, string>> = {
  'fy-current': 'This financial year',
  'fy-previous': 'Last financial year',
  'fy-before': 'The year before last',
  'next-90': 'Next 90 days',
  'next-180': 'Next 180 days',
  'next-365': 'Next 12 months',
  all: 'Everything on the book',
}

/**
 * A resolved period. `null` at either end means unbounded, which is a real
 * answer rather than a missing one — "everything on the book" has no start.
 */
export type ReportWindow = {
  readonly key: PeriodKey
  readonly label: string
  readonly from: string | null
  readonly to: string | null
}

/** The parameters one report is currently running under. */
export type ReportConfig = {
  readonly window: ReportWindow
  /** The grouping key the report declared, or an empty string when it offers none. */
  readonly group: string
  /** A company id, or null for every company. */
  readonly companyId: string | null
}

/** One choice on the grouping control. The first a report lists is its default. */
export type ReportGrouping = {
  readonly value: string
  readonly label: string
}

/** What a report accepts. A report that accepts nothing states why instead. */
export type ReportParameterSpec = {
  readonly periods?: readonly PeriodKey[]
  readonly groupings?: readonly ReportGrouping[]
  readonly companyFilter?: boolean
  /**
   * One line, on screen, when a report cannot honour a parameter. Better than a
   * control that does nothing: a select a person changes and no number moves is
   * the single fastest way to lose their trust in a report.
   */
  readonly parameterNote?: string
}

/* ------------------------------------------------------------ date helpers */

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function financialYearOf(day: string): number {
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  return month >= 4 ? year : year - 1
}

function financialYearLabel(year: number): string {
  return `FY ${year}-${String((year + 1) % 100).padStart(2, '0')}`
}

/** April the first of `year` to March the thirty-first of the next. */
function financialYearWindow(year: number): { from: string; to: string } {
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` }
}

/**
 * A preset, against the day the reader is on.
 *
 * The financial-year labels carry the year they resolved to — "This financial
 * year (FY 2026-27)" — because a figure somebody writes down has to say which
 * year it was true of, and "this" is not that.
 */
export function resolvePeriod(key: PeriodKey, today: string): ReportWindow {
  const current = financialYearOf(today)

  if (key === PERIODS.all) {
    return { key, label: PERIOD_LABELS[key], from: null, to: null }
  }

  if (key === PERIODS.next90 || key === PERIODS.next180 || key === PERIODS.next365) {
    const days = key === PERIODS.next90 ? 90 : key === PERIODS.next180 ? 180 : 365
    return { key, label: PERIOD_LABELS[key], from: today, to: addDays(today, days) }
  }

  const year =
    key === PERIODS.fyCurrent ? current : key === PERIODS.fyPrevious ? current - 1 : current - 2
  const span = financialYearWindow(year)
  return {
    key,
    label: `${PERIOD_LABELS[key]} (${financialYearLabel(year)})`,
    from: span.from,
    to: span.to,
  }
}

/**
 * Whether a recorded date falls inside a window.
 *
 * A record with no date is OUT, never in. An expiry or a start date nobody
 * recorded is absent, and quietly counting it inside every window would be the
 * same mistake as treating an unrecorded premium as zero.
 */
export function withinWindow(day: string | null | undefined, window: ReportWindow): boolean {
  if (day === null || day === undefined || day === '') return false
  if (window.from !== null && day < window.from) return false
  if (window.to !== null && day > window.to) return false
  return true
}

/* -------------------------------------------------------------- the codec */

function defaultPeriod(spec: ReportParameterSpec): PeriodKey {
  return spec.periods && spec.periods.length > 0 ? spec.periods[0] : PERIODS.all
}

function defaultGroup(spec: ReportParameterSpec): string {
  return spec.groupings && spec.groupings.length > 0 ? spec.groupings[0].value : ''
}

/** What the URL says this report is showing, resolved against the reader's day. */
export function readReportParams(
  params: URLSearchParams,
  spec: ReportParameterSpec,
  today: string,
): ReportConfig {
  const offered = spec.periods ?? []
  const askedPeriod = params.get(REPORT_PARAMS.period)
  const period =
    askedPeriod !== null && offered.includes(askedPeriod as PeriodKey)
      ? (askedPeriod as PeriodKey)
      : defaultPeriod(spec)

  const groupings = spec.groupings ?? []
  const askedGroup = params.get(REPORT_PARAMS.group)
  const group =
    askedGroup !== null && groupings.some((option) => option.value === askedGroup)
      ? askedGroup
      : defaultGroup(spec)

  const askedCompany = params.get(REPORT_PARAMS.company)
  const companyId = spec.companyFilter === true && askedCompany ? askedCompany : null

  return { window: resolvePeriod(period, today), group, companyId }
}

/**
 * The same parameters, back into a URL.
 *
 * A value that equals the report's own default is left OUT rather than written
 * in. `/reports/commission` and `/reports/commission?period=fy-current&group=source`
 * would otherwise be two addresses for one screen, and the shorter one is the
 * one a person will paste.
 */
export function writeReportParams(
  previous: URLSearchParams,
  spec: ReportParameterSpec,
  next: Partial<{ period: PeriodKey; group: string; companyId: string | null }>,
): URLSearchParams {
  const params = new URLSearchParams(previous)

  if (next.period !== undefined) {
    if (next.period === defaultPeriod(spec)) params.delete(REPORT_PARAMS.period)
    else params.set(REPORT_PARAMS.period, next.period)
  }

  if (next.group !== undefined) {
    if (next.group === defaultGroup(spec) || next.group === '') params.delete(REPORT_PARAMS.group)
    else params.set(REPORT_PARAMS.group, next.group)
  }

  if (next.companyId !== undefined) {
    if (next.companyId === null || next.companyId === '') params.delete(REPORT_PARAMS.company)
    else params.set(REPORT_PARAMS.company, next.companyId)
  }

  return params
}

/** A stable string for `useResource`, so a parameter change is a new request. */
export function reportConfigKey(config: ReportConfig): string {
  return [config.window.key, config.window.from ?? '', config.window.to ?? '', config.group, config.companyId ?? ''].join(
    '|',
  )
}
