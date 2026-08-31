/**
 * Customer cluster — plan §8, canvas flow 3.
 *
 * `Customer` and `Member` are two of the seven entities the P-02 registry already
 * classifies, so both are declared field-for-field against `FIELD_CLASSES` and
 * checked in `classification.ts`. Adding a field to either without classifying it
 * is a compile error, which is the whole point of the registry.
 *
 * Two fields deserve their own sentence. `aadhaarNumber` exists on the type
 * because the registry classifies it `sensitive` and the classification has to
 * have something to forbid; no fixture in this repository ever fills it, and a
 * fixture-integrity test asserts that. `aadhaarLast4` is also `sensitive` — a
 * masked identifier is still an identifier for correlation purposes (§14.1), so
 * the Assistant sees neither, and staff with the grant see the last four digits
 * only.
 */

import type { AmendCommand } from '../../domain/amend'
import type { ConsentState, KycCompletionRoute, KycConsentState, ExtractedField } from '../../domain/workflows'
import type { CustomerFacts, DerivedCustomerState } from '../../domain/derive'
import type { MessageChannel } from './config'
import type { MutationResult } from './result'
import type { ListQuery, Page, ReadRepository } from './query'

export const CUSTOMER_STATUSES = {
  prospect: 'prospect',
  active: 'active',
  lapsed: 'lapsed',
  dormant: 'dormant',
} as const

export type CustomerStatus = (typeof CUSTOMER_STATUSES)[keyof typeof CUSTOMER_STATUSES]

export const CUSTOMER_SOURCES = {
  website: 'website',
  walkIn: 'walk_in',
  referral: 'referral',
  subAgent: 'sub_agent',
  campaign: 'campaign',
  renewal: 'renewal',
} as const

export type CustomerSource = (typeof CUSTOMER_SOURCES)[keyof typeof CUSTOMER_SOURCES]

/**
 * A household groups the people a floater actually covers. The prototype's
 * Rakesh Patel case is the reason it exists: a health floater, a life policy and
 * two vehicles sit across one family, and the coverage-gap notice can only be
 * raised by something that can see all of them at once.
 */
export type Household = {
  readonly id: string
  readonly name: string
  readonly headCustomerId: string
  readonly customerIds: readonly string[]
  readonly city: string
}

export type Customer = {
  readonly id: string
  readonly systemNo: string
  readonly householdId: string | null
  readonly status: CustomerStatus
  readonly source: CustomerSource
  readonly createdAt: string
  readonly ownerId: string
  readonly agentId: string | null
  readonly subAgentId: string | null
  readonly kycState: KycConsentState
  readonly consentState: ConsentState
  /**
   * When a consent link was last sent to this person, and how many have been.
   *
   * Both are written by `advanceConsent` on the way into `link_issued`, so a
   * chase recorded by the bulk action and one recorded by a person opening the
   * file are the same fact written the same way — there is no path that sends a
   * link without leaving this behind.
   *
   * `null` means never chased, which is a different thing from chased long ago
   * and is the reason this is not a number of days. The KYC queue sorts on it,
   * and FR-21's cadence reads it to decide whether a resend is due.
   */
  readonly lastConsentChaseAt: string | null
  readonly consentChaseCount: number
  readonly fullName: string
  readonly mobile: string
  readonly altMobile: string | null
  readonly email: string | null
  readonly addressLine: string | null
  readonly city: string
  readonly state: string
  readonly pincode: string | null
  readonly dateOfBirth: string | null
  /** Never populated. The field exists so the classification has something to forbid. */
  readonly aadhaarNumber: null
  readonly aadhaarLast4: string | null
  readonly panNumber: string | null
  readonly bankAccountNumber: string | null
  readonly bankIfsc: string | null
}

export const MEMBER_RELATIONSHIPS = {
  self: 'self',
  spouse: 'spouse',
  son: 'son',
  daughter: 'daughter',
  father: 'father',
  mother: 'mother',
  other: 'other',
} as const

export type MemberRelationship = (typeof MEMBER_RELATIONSHIPS)[keyof typeof MEMBER_RELATIONSHIPS]

export type Member = {
  readonly id: string
  readonly customerId: string
  readonly householdId: string | null
  readonly coveredUnderPolicyIds: readonly string[]
  readonly fullName: string
  readonly relationship: MemberRelationship
  readonly dateOfBirth: string | null
  readonly gender: string | null
  readonly mobile: string | null
  /** Never populated, for the same reason as on Customer. */
  readonly aadhaarNumber: null
  readonly aadhaarLast4: string | null
  readonly healthDeclaration: string | null
  readonly preExistingConditions: readonly string[] | null
  readonly diagnosis: string | null
}

/**
 * The consent link's own record. §9 requires it to be tokenised, expiring,
 * login-free and session-free; the token is stored so the audit trail can say
 * which link was used, and `carriesSession` stays false by construction.
 */
export type ConsentRecord = {
  readonly id: string
  readonly customerId: string
  readonly state: ConsentState
  readonly token: string
  readonly channel: MessageChannel
  readonly issuedAt: string
  readonly expiresAt: string
  readonly submittedAt: string | null
}

/**
 * Canvas 3.2's credentials recipe, recorded. The username is stored so support
 * can answer "what did we send them"; no password or secret is ever held here.
 */
export type CustomerCredential = {
  readonly id: string
  readonly customerId: string
  readonly username: string
  readonly issuedAt: string
  readonly channel: MessageChannel
  readonly active: boolean
}

/**
 * Putting a customer on the books — canvas 3.1.
 *
 * Two absences are the interesting part. There is no `kycState` or
 * `consentState`: both are born in their machine's initial state and move only
 * through `advanceKyc` and `advanceConsent`. And there is no `aadhaarLast4` —
 * `aadhaarMaskedToLast4` guards the KYC edge that records it, and a create that
 * accepted the field would be a way around that guard. Bank details are absent
 * for the same reason: nothing collects them at intake.
 */
export type CreateCustomerCommand = {
  readonly actorId: string
  readonly fullName: string
  readonly mobile: string
  readonly source: CustomerSource
  readonly ownerId: string
  readonly city: string
  readonly state: string
  /** Defaults to `prospect`: somebody who has not bought anything yet. */
  readonly status?: CustomerStatus
  readonly householdId?: string | null
  readonly agentId?: string | null
  readonly subAgentId?: string | null
  readonly altMobile?: string | null
  readonly email?: string | null
  readonly addressLine?: string | null
  readonly pincode?: string | null
  readonly dateOfBirth?: string | null
  readonly panNumber?: string | null
  readonly now?: Date
}

/**
 * What the desk supplies to move KYC on.
 *
 * Two fields used to live here and no longer do: `requiredDocuments` and
 * `presentDocuments`. The guard compared them against each other, so a caller
 * could satisfy completion by describing a file rather than by having one. The
 * repository now derives both from its own document ledger — see `kycFacts`.
 *
 * `receipts` survives because it is genuinely the desk's to assert: a
 * back-office user recording that a checklist line arrived outside the vault is
 * a real action by a real person, not a claim about stored evidence.
 */
export type KycCommand = {
  readonly actorId: string
  readonly route: KycCompletionRoute
  /** Checklist lines the desk has recorded as arrived, by their configured wording. */
  readonly receipts?: readonly string[]
  /** OCR output. Any unconfirmed entry blocks the move, per the OCR invariant. */
  readonly extractedFields: readonly ExtractedField[]
  readonly aadhaarLast4?: string
  readonly now?: Date
}

export type KycFactsOptions = {
  readonly now?: Date
  /** Checklist lines recorded as arrived at the desk, by their configured wording. */
  readonly receipts?: readonly string[]
  /**
   * A masked Aadhaar arriving in this same command, before it is on the record.
   * Without it a first completion would be refused for missing the very value it
   * is carrying.
   */
  readonly pendingAadhaarLast4?: string
}

export type ConsentCommand = {
  readonly actorId: string
  readonly token?: string
  readonly expiresAt?: string
  readonly channel?: MessageChannel
  readonly now?: Date
}

export type HouseholdView = {
  readonly household: Household
  readonly customers: readonly Customer[]
  readonly members: readonly Member[]
}

export type CustomerRepository = ReadRepository<Customer> & {
  bySystemNo(systemNo: string): Promise<Customer | null>
  /** The queue an agent sees. Scope filtering is the caller's job, via `can()`. */
  forOwner(ownerId: string, query?: ListQuery): Promise<Page<Customer>>
  household(householdId: string): Promise<HouseholdView | null>
  members(customerId: string): Promise<readonly Member[]>
  consent(customerId: string): Promise<ConsentRecord | null>
  credentials(customerId: string): Promise<readonly CustomerCredential[]>

  /**
   * The KYC file as evidence, assembled from the document ledger, the configured
   * checklist and the customer's policies.
   *
   * One source, two readers: the screen draws its checklist from this and the
   * machine decides its transition from this, so the header and the checklist
   * below it cannot disagree. `receipts` are folded in by the caller that holds
   * them until they have a table of their own.
   */
  kycFacts(customerId: string, options?: KycFactsOptions): Promise<CustomerFacts | null>

  /** `kycFacts` run through `deriveCustomerState`. What a badge renders. */
  derivedState(customerId: string, options?: KycFactsOptions): Promise<DerivedCustomerState | null>

  /**
   * Puts a customer on the books, numbered, with KYC pending and no consent link
   * out. Emits `kyc.started`: a customer record is the KYC file opening, and it
   * is the event the timeline and the recipes already read.
   */
  create(command: CreateCustomerCommand): Promise<MutationResult<Customer>>

  /**
   * Moves KYC through `kycMachine`. Completion fires the credentials recipe as
   * part of the same transition (§9), so there is no path to complete that skips
   * it and no way for a caller to set `kycState` themselves.
   */
  advanceKyc(
    customerId: string,
    to: KycConsentState,
    command: KycCommand,
  ): Promise<MutationResult<Customer>>

  /** Moves the consent link through `consentMachine`. */
  advanceConsent(
    customerId: string,
    to: ConsentState,
    command: ConsentCommand,
  ): Promise<MutationResult<Customer>>

  /**
   * Corrects the file — FR-20.4. `AMEND_POLICIES.Customer` is the contact block,
   * the address, the date of birth and the attribution: everything a person
   * typed off a phone call or a form, and nothing else. The identity fields are
   * absent from the allow-list permanently, so no correction can reach an
   * Aadhaar, a PAN or a bank account by any route.
   *
   * There is deliberately no `discard` on this interface and no `delete`. A
   * customer carries regulatory retention, so the honest path for "remove me" is
   * an erase request — see `EraseRequestRepository` — which answers with the
   * obligation that forces retention rather than with a silent refusal.
   */
  amend(id: string, command: AmendCommand): Promise<MutationResult<Customer>>
}
