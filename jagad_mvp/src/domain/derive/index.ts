/**
 * Derived state — what the record says, computed from what is on file.
 *
 * Nothing in here is stored. Every function is pure and takes its clock as an
 * argument, so a caller can ask what a record looked like at any moment rather
 * than only what it looks like now.
 */

export {
  KYC_BLOCKERS,
  RECEIVED_REVIEW_STATES,
  REJECTED_REVIEW_STATES,
  REQUIREMENT_OUTCOMES,
  VERIFIED_REVIEW_STATES,
  deriveCustomerState,
  docTypeForItem,
  kycStateReason,
  requirementsFor,
} from './customerState'

export type {
  CustomerFacts,
  DerivedCustomerState,
  DocumentFact,
  KycBlocker,
  PolicyFact,
  ReceiptFact,
  RequirementFact,
  RequirementOutcome,
  RequirementReading,
} from './customerState'
