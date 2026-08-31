/**
 * The renewals module — plan §4's `/renewals` routes, §5's "Renewal pool",
 * §9's renewal machine and the premium-schedule rules from D-A, and canvas
 * flow 5 (n26 to n31).
 */
export { RenewalClockBase, useRenewalNow } from './clock'
export { RenewalPoolScreen } from './RenewalPoolScreen'
export { RenewalDetailScreen } from './RenewalDetailScreen'
export { InstalmentScreen } from './InstalmentScreen'
export { renewalDesk, queryRenewals } from './data/renewal-desk'
export type {
  LapseCommand,
  PoolRenewalCommand,
  RemindRenewalCommand,
  RenewCommand,
  RenewalDeskRepository,
} from './data/renewal-desk'
export { instalmentQueueConfig, renewalPoolConfig } from './queue-config'
export { loadPoolSource, onlyKind, queryPool } from './pool-source'
export type { PoolSource } from './pool-source'
export { leadDaysOrNull, maxReminders, readLeadDays } from './lead-days'
export {
  CONTINUITY_AT_RISK,
  INSTALMENT_LABEL,
  INSTALMENT_TONE,
  MODE_LABEL,
  OPEN_INSTALMENT_STATES,
  POOL_KINDS,
  POOL_KIND_LABEL,
  POOL_KIND_MEANING,
  POOL_KIND_TONE,
  RENEWAL_LABEL,
  RENEWAL_TONE,
  graceEndsOn,
  instalmentRow,
  poolSeverity,
  renewalRow,
} from './renewal-view'
export type { PoolKind, PoolRow } from './renewal-view'
