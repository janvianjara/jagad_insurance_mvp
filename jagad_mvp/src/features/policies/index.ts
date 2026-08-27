/**
 * The policy module — plan §4's `/policies`, `/policies/new`, `/policies/:id`
 * and `/back-office/drafts`, §5's "Policy entry (SKU form)" and "Policy detail"
 * rows, §9's deal-to-policy and collection machines, and canvas scenarios 3.3
 * to 3.7.
 *
 * The one thing to know before reading further: no export from this module
 * produces a `Money`. Amounts are typed into `<RecordOnlyAmount>` or confirmed
 * in an `<OcrField>`, `<RollUp>` renders the only arithmetic the product allows,
 * and `premium-stop.test.ts` holds the whole feature to that in its own source.
 */
export { PolicyQueueScreen } from './PolicyQueueScreen'
export { PolicyEntryScreen } from './PolicyEntryScreen'
export { PolicyDetailScreen } from './PolicyDetailScreen'
export { PolicyDraftsScreen } from './PolicyDraftsScreen'

export { PremiumBlock } from './PremiumBlock'
export type { PremiumBlockProps } from './PremiumBlock'
export { PaymentFork } from './PaymentFork'
export type { PaymentForkProps } from './PaymentFork'
export { IssuancePanel } from './IssuancePanel'
export type { IssuancePanelProps } from './IssuancePanel'

export { MISSING_NAMES_SHOWN, draftQueueConfig, policyQueueConfig } from './queue-config'
export type { DraftQueueDeps, PolicyQueueDeps } from './queue-config'

export {
  ENTRY_OBJECT_BY_LINE,
  FALLBACK_RETENTION_CLASS,
  GENERIC_ENTRY_OBJECT,
  RETENTION_CLASS_BY_LINE,
  entryCatalogue,
  fieldLabelsFrom,
  missingKeysOf,
  retentionClassFor,
  schemaForProduct,
} from './entry-data'
export type { EntryContext } from './entry-data'

export {
  MOCK_CONFIDENCE,
  MOCK_POLICY_PAGES,
  extractIssuance,
  extractorNote,
  pageFor,
} from './ocr-extract'
export type { MockPolicyPage } from './ocr-extract'

export {
  DRAFT_BARELY_STARTED,
  DRAFT_NEARLY_DONE,
  ENTRY_PATH_LABEL,
  ENTRY_PATH_SERIES,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  POLICY_LABEL,
  POLICY_TONE,
  PREMIUM_MODE_LABEL,
  draftSeverity,
  nameOf,
  policySeverity,
} from './policy-view'

export {
  ISSUANCE_FIELDS,
  ISSUE_BLOCKERS,
  TYPED_PREMIUM_SOURCES,
  isBounceWatched,
  premiumShapeOf,
} from './entry-types'
export type {
  IssuanceExtraction,
  IssuanceFieldName,
  IssuanceReview,
  IssueBlocker,
  IssueBlockerKey,
  PaymentEntry,
  PremiumComponent,
  PremiumEntry,
  PremiumShape,
  TypedPremiumSource,
} from './entry-types'

export {
  FEEDBACK_TEMPLATE_KEY,
  ISSUED_RECIPE_KEY,
  ISSUED_TEMPLATE_KEY,
  allPolicies,
  policyDesk,
} from './data/policy-desk'
export type {
  BounceFollowUp,
  BouncePaymentInput,
  EnterPolicyInput,
  IssuePolicyInput,
  PolicyBounce,
  PolicyDesk,
  PolicyDossier,
  PolicyExtractionReview,
  PolicyFileRef,
  PolicyIssuance,
  RecordPaymentInput,
} from './data/policy-desk'
