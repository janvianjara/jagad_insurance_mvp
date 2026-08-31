/**
 * The customer module — plan §4's `/customers` routes, §5's "Customer list" and
 * "Customer 360" rows, and canvas flow 3.
 */
export { CustomerListScreen } from './CustomerListScreen'
export { Customer360Screen } from './Customer360Screen'
export { CustomerClockBase, useCustomerNow } from './clock'
export { CustomerConsent } from './CustomerConsent'
export { CustomerQuickAdd } from './CustomerQuickAdd'
export type { CustomerQuickAddProps } from './CustomerQuickAdd'
export type { CustomerConsentProps } from './CustomerConsent'
export {
  CUSTOMER_TABS,
  customerTabFromLocation,
  customerTabHref,
  readCustomerTab,
} from './customer-tabs'
export type { CustomerTab } from './customer-tabs'
export {
  CHANNEL_LABEL,
  CONSENT_ACTS,
  SKIPS_NOT_LOGGED,
  WITHDRAWAL_NOT_ON_THE_MACHINE,
  WITHDRAWAL_RIGHT,
  channelStandings,
  consentLedger,
  suppressedChannels,
} from './consent-view'
export type { ChannelStanding, ConsentAct, ConsentLedgerEntry } from './consent-view'
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
  ConsentWithdrawal,
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
