/**
 * The claims module — plan §4's `/claims` routes, §5's "Claim queue + detail",
 * §9's claim machine, and canvas flow 4 (n37 to n50).
 */
export { ClaimQueueScreen } from './ClaimQueueScreen'
export { ClaimIntimationScreen } from './ClaimIntimationScreen'
export { ClaimDetailScreen } from './ClaimDetailScreen'
export { claimDesk, queryClaims } from './data/claim-desk'
export type {
  ClaimDeskRepository,
  IntimateClaimCommand,
  StatusMessageLogEntry,
} from './data/claim-desk'
export { claimQueueConfig, loadClaims, nameOfCustomer, nameOfUser } from './queue-config'
export {
  CASHLESS_PIPELINE,
  CLAIM_LABEL,
  CLAIM_TONE,
  CLAIM_TYPE_LABEL,
  FILE_PIPELINE,
  claimPinRank,
  claimSeverity,
  outstandingChecklist,
  pipelineFor,
  pipelineIndex,
  planStatusMessage,
} from './claim-view'
export type { StatusMessagePlan } from './claim-view'
