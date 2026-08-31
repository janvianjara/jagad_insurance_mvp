/**
 * The reports module's public surface — the core dashboard of plan §5.
 *
 * The screens are reached through `routes.ts`, which is the only file the router
 * touches. What is exported here is the desk and the catalogue. Everything the
 * desk returns is a count of rows that exist or a sum of amounts somebody typed;
 * nothing in this module produces a figure that was not recorded.
 */
export { reportsDesk, BIRTHDAY_WINDOW_DAYS } from './data/reports-desk'
export {
  addDays,
  claimStateLabel,
  financialYearLabel,
  financialYearOf,
  isoDay,
  policyStatusLabel,
} from './data/reports-desk'
export type {
  Birthday,
  ClaimSummary,
  CountRow,
  PolicySummary,
  RenewalBucket,
  ReportSet,
  ReportsDesk,
  YearRow,
} from './data/reports-desk'
export { REPORTS, REPORT_KEYS, reportDefinition } from './report-catalogue'
export type { ReportDefinition, ReportKey } from './report-catalogue'
export { ReportClockBase, useReportNow } from './clock'
