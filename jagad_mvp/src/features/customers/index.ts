/**
 * The customer module — plan §4's `/customers` routes, §5's "Customer list" and
 * "Customer 360" rows, and canvas flow 3.
 */
export { CustomerListScreen } from './CustomerListScreen'
export { Customer360Screen } from './Customer360Screen'
export { CustomerClockBase, useCustomerNow } from './clock'
export { customerQueueConfig, customerSeverity } from './queue-config'
export type { CustomerQueueDeps } from './queue-config'
export {
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_STATUS_TONE,
  DOCUMENT_TYPE_LABEL,
  KYC_LABEL,
  KYC_TONE,
  RELATIONSHIP_LABEL,
  actorNamer,
  activePolicies,
  kycOutstanding,
  timelineDetail,
  timelineOptions,
} from './customer-view'
export { CREDENTIALS_RECIPE_KEY, actorFor, customerDesk, usernameFor } from './data/customer-desk'
export type {
  ChecklistReceipt,
  ConsentInvite,
  ConsentIssue,
  ConsentSubmitResult,
  ConsentSubmission,
  CustomerDesk,
  CustomerDossier,
  ExtractionReview,
  KycCompletion,
} from './data/customer-desk'
export {
  CONSENT_LINK_VALID_DAYS,
  consentExpiryFrom,
  isTokenExpired,
  newConsentToken,
} from './data/consent-token'
