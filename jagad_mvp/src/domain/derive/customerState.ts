/**
 * Derived customer state — the reconciliation point for §9's KYC file.
 *
 * The defect this module exists to remove: `kycState` used to be a column on
 * `Customer`, written by whoever called `advanceKyc`, while the checklist a
 * screen drew came from the document vault. Two sources of truth on one screen,
 * so a header could read "KYC complete" above a checklist showing nothing on
 * file, and nothing in the system was wrong — they were answering different
 * questions.
 *
 * Three rules, and each is the fix for a distinct hole:
 *
 *   1. **The state is computed, never stored.** A caller cannot assert it. The
 *      only inputs are what is actually on file.
 *
 *   2. **An empty requirement list cannot complete a file.** `requiredDocuments:
 *      []` used to satisfy the old guard vacuously — no requirements, nothing
 *      missing, therefore complete. An unconfigured checklist means nobody has
 *      decided what this product needs, which is the opposite of "it needs
 *      nothing". `KYC_BLOCKERS.noChecklist` says so, and it never reads as done.
 *
 *   3. **Completeness decays.** A document rejected on review, superseded, or
 *      past its expiry stops counting the moment it does, because the state is
 *      recomputed rather than remembered.
 *
 * Structural inputs, deliberately: `src/domain` may not import `src/data` (data
 * imports domain, and the arrow only points one way), so the facts below are
 * declared by shape. `DocumentRecord`, `DocChecklist` and `Policy` all satisfy
 * them without either layer knowing about the other.
 *
 * Layer note: pure. No React, no repository, no clock of its own — `now` is an
 * input so a caller can ask what a file looked like at any moment.
 */

import type { KycConsentState } from '../workflows'

/**
 * The three KYC states, as literals.
 *
 * Deliberately NOT imported as a value from the machine: `src/domain/workflows`
 * imports this module for its guard, so a value import back would close a cycle.
 * The literals are typed `KycConsentState` below, so the compiler proves they
 * are exactly the machine's own set and a rename there fails the build here.
 */
const KYC_PENDING: KycConsentState = 'pending'
const KYC_PARTIAL: KycConsentState = 'partial'
const KYC_COMPLETE: KycConsentState = 'complete'

/* ------------------------------------------------------------------ matching */

/**
 * Which document type a checklist line is asking for.
 *
 * Matched on the line's own words rather than on a key, because the checklist an
 * admin edits is prose and always will be. This lives in the domain rather than
 * beside the KYC screen because both the screen and the repository that decides
 * a transition have to reach the same answer — two implementations of this
 * matching is exactly the drift the module exists to remove.
 *
 * Typed `string` rather than the data layer's `DocumentType`: `src/domain` may
 * not import `src/data`. The feature narrows it back at the render edge.
 *
 * A line that matches nothing is not dropped. It stays outstanding until
 * somebody records it arriving, which is the honest answer for "Address proof"
 * in a vault whose document types do not yet include one.
 */
const TYPE_KEYWORDS: readonly (readonly [string, RegExp])[] = [
  ['aadhaar', /aadhaar/i],
  ['pan', /\bpan\b/i],
  ['photo', /photograph|\bphoto\b/i],
  ['proposal_form', /proposal/i],
  ['policy_pdf', /policy (document|copy|pdf)/i],
  ['cheque_image', /cheque/i],
]

export function docTypeForItem(item: string): string | null {
  return TYPE_KEYWORDS.find(([, pattern]) => pattern.test(item))?.[0] ?? null
}

/** A configured checklist's lines, resolved to the types they ask for. */
export function requirementsFor(items: readonly string[]): readonly RequirementFact[] {
  return items.map((item) => ({ key: item, docType: docTypeForItem(item) }))
}

/* --------------------------------------------------------------------- facts */

/**
 * One line of the configured checklist, already matched to a document type by
 * the caller.
 *
 * The matching stays outside this module because the checklist an admin edits is
 * prose ("Address proof", "Passport photograph") and matching prose to a type is
 * a reading problem, not a rule. `docType` is null for a line the vault has no
 * type for; such a line can still be satisfied by a desk receipt.
 */
export type RequirementFact = {
  /** The checklist line's own wording. Stable enough to key a receipt by. */
  readonly key: string
  readonly docType: string | null
}

/**
 * The review verdicts this module knows how to read.
 *
 * `reviewState` on `DocumentFact` below is a bare `string` rather than the
 * vault's own union, for two reasons. `src/domain` may not import `src/data`,
 * so the union is not reachable; and a verdict this module has never heard of
 * must not silently satisfy a requirement. Anything outside the three sets
 * below counts for nothing, which is the safe direction to fail in.
 */
export const VERIFIED_REVIEW_STATES: readonly string[] = ['verified']

/** On file, not yet checked. Counts as present; §9's bar is presence, not verification. */
export const RECEIVED_REVIEW_STATES: readonly string[] = ['submitted', 'awaiting']

export const REJECTED_REVIEW_STATES: readonly string[] = ['rejected']

/**
 * A document as this module reads it: presence and verdict, never content.
 * §14.1 draws that line and this shape is one of the places it is drawn.
 */
export type DocumentFact = {
  readonly docType: string
  readonly isPresent: boolean
  readonly reviewState: string
  /** Null when the document does not expire. A past expiry stops counting. */
  readonly expiresAt?: string | null
}

/** A checklist line the back office recorded as arrived outside the vault. */
export type ReceiptFact = {
  readonly key: string
}

/** Enough of a policy to know whether the customer is actually covered. */
export type PolicyFact = {
  readonly status: string
}

export type CustomerFacts = {
  readonly now: Date
  /**
   * The configured checklist, resolved. An EMPTY array means no checklist is
   * configured, which is not the same as "nothing is required" — see rule 2.
   */
  readonly requirements: readonly RequirementFact[]
  readonly documents: readonly DocumentFact[]
  readonly receipts: readonly ReceiptFact[]
  readonly policies: readonly PolicyFact[]
  /** Whether the record carries the masked Aadhaar §9 requires before completion. */
  readonly aadhaarLast4Present: boolean
}

/* ------------------------------------------------------------------ outcomes */

export const REQUIREMENT_OUTCOMES = {
  outstanding: 'outstanding',
  received: 'received',
  verified: 'verified',
  rejected: 'rejected',
} as const

export type RequirementOutcome =
  (typeof REQUIREMENT_OUTCOMES)[keyof typeof REQUIREMENT_OUTCOMES]

export type RequirementReading = {
  readonly key: string
  readonly outcome: RequirementOutcome
}

/** Why a file is not complete. Named, so a badge can explain instead of assert. */
export const KYC_BLOCKERS = {
  noChecklist: 'no_checklist',
  documentsOutstanding: 'documents_outstanding',
  documentsRejected: 'documents_rejected',
  aadhaarMissing: 'aadhaar_missing',
} as const

export type KycBlocker = (typeof KYC_BLOCKERS)[keyof typeof KYC_BLOCKERS]

export type DerivedCustomerState = {
  readonly kycState: KycConsentState
  readonly requirements: readonly RequirementReading[]
  /** Checklist lines not yet on file, by their configured wording. */
  readonly outstanding: readonly string[]
  /** Lines refused on review. Distinct from outstanding: somebody must be asked again. */
  readonly rejected: readonly string[]
  readonly satisfiedCount: number
  readonly verifiedCount: number
  readonly requiredCount: number
  /** Every reason the file is not complete. Empty exactly when `kycState` is complete. */
  readonly blockers: readonly KycBlocker[]
  /** 0-100, for a roll-up. Presented as a reading; it gates nothing. */
  readonly completenessScore: number
  readonly hasLivePolicy: boolean
  /**
   * Contradictions in the record itself. Non-empty means the data disagrees with
   * itself and a person should look — never a customer-facing nudge.
   */
  readonly integrityAlarms: readonly string[]
}

/* ---------------------------------------------------------------- derivation */

/** Cover the customer actually holds. Draft is work in progress; lapsed is history. */
const LIVE_POLICY_STATES: readonly string[] = [
  'issued',
  'dispatched',
  'documents_collected',
]

const PERCENT = 100

function isExpired(fact: DocumentFact, now: Date): boolean {
  if (fact.expiresAt === undefined || fact.expiresAt === null) return false
  return new Date(fact.expiresAt).getTime() <= now.getTime()
}

/**
 * How one checklist line reads against the vault and the desk.
 *
 * A rejected document is reported as rejected rather than collapsed into
 * outstanding: "we do not have it" and "we had it and refused it" call for
 * different sentences and different work.
 */
function readRequirement(
  requirement: RequirementFact,
  facts: CustomerFacts,
): RequirementOutcome {
  const matching = facts.documents.filter(
    (document) =>
      requirement.docType !== null &&
      document.docType === requirement.docType &&
      document.isPresent &&
      !isExpired(document, facts.now),
  )

  if (matching.some((document) => VERIFIED_REVIEW_STATES.includes(document.reviewState))) {
    return REQUIREMENT_OUTCOMES.verified
  }
  if (matching.some((document) => RECEIVED_REVIEW_STATES.includes(document.reviewState))) {
    return REQUIREMENT_OUTCOMES.received
  }

  // A desk receipt answers a line the vault has no type for. Checked before the
  // rejection verdict so a fresh copy recorded at the desk clears an old refusal.
  if (facts.receipts.some((receipt) => receipt.key === requirement.key)) {
    return REQUIREMENT_OUTCOMES.received
  }

  if (matching.some((document) => REJECTED_REVIEW_STATES.includes(document.reviewState))) {
    return REQUIREMENT_OUTCOMES.rejected
  }

  return REQUIREMENT_OUTCOMES.outstanding
}

function satisfies(outcome: RequirementOutcome): boolean {
  return (
    outcome === REQUIREMENT_OUTCOMES.verified || outcome === REQUIREMENT_OUTCOMES.received
  )
}

/**
 * The single reconciliation point.
 *
 * The 360 header, the KYC queue, the completion guard and the issuance gate all
 * call this, so drift between them stops being something to test for and starts
 * being unrepresentable.
 */
export function deriveCustomerState(facts: CustomerFacts): DerivedCustomerState {
  const readings: readonly RequirementReading[] = facts.requirements.map((requirement) => ({
    key: requirement.key,
    outcome: readRequirement(requirement, facts),
  }))

  const outstanding = readings
    .filter((reading) => reading.outcome === REQUIREMENT_OUTCOMES.outstanding)
    .map((reading) => reading.key)

  const rejected = readings
    .filter((reading) => reading.outcome === REQUIREMENT_OUTCOMES.rejected)
    .map((reading) => reading.key)

  const satisfiedCount = readings.filter((reading) => satisfies(reading.outcome)).length
  const verifiedCount = readings.filter(
    (reading) => reading.outcome === REQUIREMENT_OUTCOMES.verified,
  ).length
  const requiredCount = readings.length

  const blockers: KycBlocker[] = []
  // Rule 2. An unconfigured checklist is an open question, not an empty one.
  if (requiredCount === 0) blockers.push(KYC_BLOCKERS.noChecklist)
  if (outstanding.length > 0) blockers.push(KYC_BLOCKERS.documentsOutstanding)
  if (rejected.length > 0) blockers.push(KYC_BLOCKERS.documentsRejected)
  if (!facts.aadhaarLast4Present) blockers.push(KYC_BLOCKERS.aadhaarMissing)

  const anythingOnFile = satisfiedCount > 0 || rejected.length > 0 || facts.aadhaarLast4Present

  const kycState: KycConsentState =
    blockers.length === 0 ? KYC_COMPLETE : anythingOnFile ? KYC_PARTIAL : KYC_PENDING

  const hasLivePolicy = facts.policies.some((policy) =>
    LIVE_POLICY_STATES.includes(policy.status),
  )

  const integrityAlarms: string[] = []
  if (hasLivePolicy && kycState !== KYC_COMPLETE) {
    integrityAlarms.push(
      'A live policy is held against an incomplete KYC file. Cover is in force on a file that would not pass the issuance gate today.',
    )
  }

  const completenessScore =
    requiredCount === 0 ? 0 : Math.round((satisfiedCount / requiredCount) * PERCENT)

  return {
    kycState,
    requirements: readings,
    outstanding,
    rejected,
    satisfiedCount,
    verifiedCount,
    requiredCount,
    blockers,
    completenessScore,
    hasLivePolicy,
    integrityAlarms,
  }
}

/* ------------------------------------------------------------------ sentences */

/**
 * What the badge says under itself.
 *
 * A badge that cannot explain itself is a badge that can drift without anybody
 * noticing, so every derived state carries the sentence that justifies it.
 */
export function kycStateReason(derived: DerivedCustomerState): string {
  if (derived.kycState === KYC_COMPLETE) {
    return derived.verifiedCount === derived.requiredCount
      ? `All ${derived.requiredCount} required documents are on file and verified.`
      : `All ${derived.requiredCount} required documents are on file; ${derived.verifiedCount} verified.`
  }

  const parts: string[] = []
  if (derived.blockers.includes(KYC_BLOCKERS.noChecklist)) {
    parts.push(
      'No document checklist is configured for this product, so there is nothing to check the file against.',
    )
  }
  if (derived.outstanding.length > 0) {
    parts.push(`Not on file: ${derived.outstanding.join(', ')}.`)
  }
  if (derived.rejected.length > 0) {
    parts.push(`Rejected on review, ask again: ${derived.rejected.join(', ')}.`)
  }
  if (derived.blockers.includes(KYC_BLOCKERS.aadhaarMissing)) {
    parts.push('The record carries no Aadhaar last-4.')
  }
  return parts.join(' ')
}
