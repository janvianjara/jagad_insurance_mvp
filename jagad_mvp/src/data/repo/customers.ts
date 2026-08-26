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

import type { ConsentState, KycCompletionRoute, KycConsentState, ExtractedField } from '../../domain/workflows'
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

/** Everything the KYC machine's guards need, supplied by the desk doing the work. */
export type KycCommand = {
  readonly actorId: string
  readonly route: KycCompletionRoute
  readonly requiredDocuments: readonly string[]
  readonly presentDocuments: readonly string[]
  /** OCR output. Any unconfirmed entry blocks the move, per the OCR invariant. */
  readonly extractedFields: readonly ExtractedField[]
  readonly aadhaarLast4?: string
  readonly now?: Date
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
}
