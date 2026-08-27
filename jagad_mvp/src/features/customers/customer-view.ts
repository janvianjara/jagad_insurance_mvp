/**
 * How a customer reads: states as tones, relationships as words, the event log
 * as names a person recognises.
 *
 * Pure, and deliberately outside the screens. Everything here is an assertion
 * the plan makes rather than a presentation choice, and each is easier to keep
 * honest when it can be tested without a DOM:
 *
 *   - a machine state maps to a tone through `src/ui/tone.ts` and nowhere else,
 *     so no screen invents a colour per status;
 *   - the household is the unit §8 says it is — the floater covers a family, and
 *     the 360 has to be able to see all of them at once;
 *   - the timeline's actor names are resolved here, so `<RecordTimeline>` stays
 *     a component that reads no repository.
 */

import type { DomainEvent } from '../../domain/events'
import type { KycConsentState, PolicyState } from '../../domain/workflows'
import type {
  Customer,
  CustomerStatus,
  DocumentType,
  MemberRelationship,
  Policy,
  StaffUser,
} from '../../data/repo'
import type { TimelineOptions } from '../../components/RecordTimeline'
import type { Tone } from '../../ui/tone'

export const CUSTOMER_STATUS_LABEL: Readonly<Record<CustomerStatus, string>> = {
  prospect: 'Prospect',
  active: 'Active',
  lapsed: 'Lapsed',
  dormant: 'Dormant',
}

export const CUSTOMER_STATUS_TONE: Readonly<Record<CustomerStatus, Tone>> = {
  prospect: 'info',
  active: 'ok',
  lapsed: 'bad',
  dormant: 'idle',
}

export const KYC_LABEL: Readonly<Record<KycConsentState, string>> = {
  pending: 'KYC not started',
  partial: 'KYC part-filled',
  complete: 'KYC complete',
}

/** Part-filled is lime: it needs a person, and it is not an error (U7). */
export const KYC_TONE: Readonly<Record<KycConsentState, Tone>> = {
  pending: 'warn',
  partial: 'attn',
  complete: 'ok',
}

export const RELATIONSHIP_LABEL: Readonly<Record<MemberRelationship, string>> = {
  self: 'Self',
  spouse: 'Spouse',
  son: 'Son',
  daughter: 'Daughter',
  father: 'Father',
  mother: 'Mother',
  other: 'Other',
}

export const DOCUMENT_TYPE_LABEL: Readonly<Record<DocumentType, string>> = {
  aadhaar: 'Aadhaar',
  pan: 'PAN card',
  photo: 'Photograph',
  proposal_form: 'Proposal form',
  policy_pdf: 'Policy document',
  quotation_pdf: 'Quotation',
  renewal_notice: 'Renewal notice',
  cheque_image: 'Cheque image',
  discharge_summary: 'Discharge summary',
  claim_form: 'Claim form',
  endorsement_letter: 'Endorsement letter',
}

/** Which customers the KYC desk still owes work on. The queue is built off this. */
export function kycOutstanding(customer: Customer): boolean {
  return customer.kycState !== 'complete'
}

/**
 * Live cover, as the 360 header counts it.
 *
 * Issued onwards is cover the customer has; a draft is work in progress and a
 * lapsed or closed policy is history. The set is named here rather than inlined
 * so the count on the header and the count on the household panel cannot drift.
 */
const LIVE_POLICY_STATES: readonly PolicyState[] = [
  'issued',
  'dispatched',
  'documents_collected',
]

export function activePolicies(policies: readonly Policy[]): readonly Policy[] {
  return policies.filter((policy) => LIVE_POLICY_STATES.includes(policy.status))
}

/* ------------------------------------------------------------------ timeline */

const CUSTOMER_ACTOR = 'customer:'

/**
 * Turns an actor id into a name.
 *
 * Three kinds of actor reach a customer's log: a staff id, the customer
 * themselves (the consent page has no session, so §11.1's pages name the
 * customer as the actor), and a recipe with no actor at all. A document's
 * `uploadedByName` is already a name and passes straight through, which is why
 * an unmatched value is returned rather than replaced by "Unknown" — the string
 * on the record is more useful than a placeholder.
 */
export function actorNamer(
  users: readonly StaffUser[],
  customer: Customer,
): (actorId: string | undefined) => string {
  const byId = new Map(users.map((user) => [user.id, user.name]))

  return (actorId) => {
    if (!actorId) return 'System'
    if (actorId.startsWith(CUSTOMER_ACTOR)) return `${customer.fullName} (customer)`
    return byId.get(actorId) ?? actorId
  }
}

/**
 * Extra prose for one timeline line.
 *
 * Reads only the workflow detail the event carries — a route, a state pair, a
 * channel — and never a value. `detail` is documented in §7 as holding no
 * amount and no sensitive field, and this function is the reason that has to
 * stay true: everything put there is rendered.
 */
export function timelineDetail(event: DomainEvent): string | undefined {
  const detail = event.detail
  if (!detail) return undefined

  const parts: string[] = []
  if (typeof detail.route === 'string') {
    parts.push(
      detail.route === 'consent_link'
        ? 'Completed through the consent link the customer filled themselves.'
        : 'Completed at the desk by back-office staff.',
    )
  }
  if (typeof detail.from === 'string' && typeof detail.to === 'string') {
    parts.push(`${detail.from} to ${detail.to}.`)
  }
  return parts.length === 0 ? undefined : parts.join(' ')
}

export function timelineOptions(
  users: readonly StaffUser[],
  customer: Customer,
): TimelineOptions {
  return { actorName: actorNamer(users, customer), detailOf: timelineDetail, order: 'newest' }
}
