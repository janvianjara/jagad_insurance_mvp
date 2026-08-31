/**
 * The KYC module — plan §4's `/back-office/kyc`, §5's "KYC queue + detail" row,
 * §9's KYC and consent machine, and canvas scenarios 3.1 and 3.2.
 */
export { KycQueueScreen } from './KycQueueScreen'
export { KycFile } from './KycFile'
export type { KycFileProps } from './KycFile'
export { OUTSTANDING_KYC, kycQueueConfig, kycSeverity, loadOutstanding } from './queue-config'
export type { KycQueueDeps } from './queue-config'
export { latestPolicyOf, loadKycChecklist } from './checklist-source'
export type { ChecklistSource } from './checklist-source'
export {
  aadhaarLast4Of,
  checklistFor,
  derivedStateFor,
  docTypeForItem,
  extractionsFor,
  itemsSuppliedByConsent,
  kycCommandFor,
  kycFactsFor,
  maskAtExtraction,
  unconfirmedExtractions,
} from './kyc-view'
export type { KycChecklist, KycCommandInput, KycExtraction } from './kyc-view'
