/**
 * The back-office module's public surface — FR-08.1's six-queue ops home, and
 * the two ops queues this module owns outright.
 *
 * The screens themselves are reached through `routes.ts`, which is the only file
 * the router touches. What is exported here is what other modules legitimately
 * need to speak about this desk:
 *
 *   - the queue vocabulary, because the state sets are shared. The home's depth
 *     read and its tile's link are built from the same constants, and anything
 *     else that needs to say "a collection awaiting verification" should say it
 *     with this one rather than a second copy — the collections feature already
 *     does;
 *   - the issuance span, for the same reason: `/back-office/drafts` and this desk
 *     divide the policy machine between them, and the boundary is a constant
 *     rather than a sentence in two files' comments;
 *   - the masking and extraction rules the OCR review screen is built on, which
 *     are pure and are the honest place to test the Aadhaar invariant from.
 *
 * The queue configurations themselves are deliberately NOT exported. They pull
 * their drawers, and the drawers pull `<IssuancePanel>`; re-exporting them here
 * would drag two screens' worth of React into `collectionDesk`, which imports
 * this file for one string array. A screen is reached through `routes.ts`.
 */
export { opsDesk } from './data/ops-desk'
export type { OpsBoard, OpsDesk } from './data/ops-desk'
export {
  AWAITING_ENTRY_STATES,
  CLAIM_FOLLOW_UP_STATES,
  COLLECTION_VERIFICATION_STATES,
  KYC_OUTSTANDING_STATES,
  OPS_QUEUES,
  OPS_QUEUE_KEYS,
  SUB_AGENT_INTAKE_STATES,
} from './queues'
export type { OpsQueue, OpsQueueKey } from './queues'

/* ---------------------------------------------------------------- issuance */

export { INSURER_NUMBER_FILTER, STAGE_FILTER, issuanceDesk, stagesFor } from './data/issuance-desk'
export type { IssuanceDesk, IssuanceRow } from './data/issuance-desk'
export {
  INSURER_NUMBER_LABEL,
  INSURER_NUMBER_STATES,
  ISSUANCE_AGE_LIMIT_DAYS,
  ISSUANCE_STATES,
  daysInDesk,
  documentsAwaitingReview,
  inDeskSince,
  inIssuanceSpan,
  insurerHasAnswered,
  insurerNumberStateOf,
  issuanceOutstanding,
  issuanceSeverity,
  policyDocumentPresent,
  premiumSettled,
} from './issuance-view'
export type { InsurerNumberState, IssuanceSeverityInput } from './issuance-view'

/* -------------------------------------------------------------- OCR review */

export {
  REVIEW_PROGRESS_FILTER,
  nothingExtracted,
  ocrReviewDesk,
  stillWaiting,
} from './data/ocr-review-desk'
export type {
  AcceptReviewInput,
  OcrReviewDesk,
  OcrReviewRow,
  ReviewOutcome,
} from './data/ocr-review-desk'
export {
  DEFAULT_CONFIDENCE,
  IDENTITY_DOC_TYPES,
  REVIEW_AGE_LIMIT_DAYS,
  REVIEW_PROGRESS,
  REVIEW_PROGRESS_LABEL,
  confidenceFor,
  daysWaiting,
  extractionsOf,
  fieldLabel,
  isMaskedField,
  lowestConfidence,
  maskExtractedValue,
  ocrReviewSeverity,
  reviewProgressOf,
  unconfirmed,
} from './ocr-review-view'
export type { ExtractionVerdict, ReviewExtraction, ReviewProgress } from './ocr-review-view'
