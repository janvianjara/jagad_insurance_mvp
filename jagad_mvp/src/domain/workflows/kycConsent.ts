/**
 * KYC and consent — plan §9, FR-09.3 and .9, canvas n17-n19, M0.
 *
 *   pending -> partial -+- staff completes -----+
 *                       +- consent link filled -+-> complete -> credentials generated + sent
 *
 * Two machines because they are two clocks: the KYC record fills up over days,
 * while a consent link is issued, used once and expires. §9's three bullets are
 * all here — Aadhaar masked to last-4 on extraction, the consent link tokenised
 * and login-free, and the credentials recipe firing automatically on completion
 * rather than waiting for somebody to remember.
 */

import { createMachine, allow, refuse } from './machine'
import type { TransitionResult, TransitionTable } from './machine'
import { KYC_BLOCKERS } from '../derive/customerState'
import type { DerivedCustomerState } from '../derive/customerState'

export const KYC_CONSENT_STATES = {
  pending: 'pending',
  partial: 'partial',
  complete: 'complete',
} as const

export type KycConsentState = (typeof KYC_CONSENT_STATES)[keyof typeof KYC_CONSENT_STATES]

export const CONSENT_STATES = {
  notSent: 'not_sent',
  linkIssued: 'link_issued',
  submitted: 'submitted',
  expired: 'expired',
} as const

export type ConsentState = (typeof CONSENT_STATES)[keyof typeof CONSENT_STATES]

/** How the missing half of a partial KYC arrived. Both routes land on the same state. */
export const KYC_COMPLETION_ROUTES = { staff: 'staff', consentLink: 'consent_link' } as const
export type KycCompletionRoute = (typeof KYC_COMPLETION_ROUTES)[keyof typeof KYC_COMPLETION_ROUTES]

/**
 * A field lifted off a document by OCR. `value` is what the extractor produced,
 * before masking — which is exactly why this type never leaves the domain layer
 * and why the guard below checks it.
 */
export type ExtractedField = {
  readonly name: string
  readonly value: string
  readonly confirmed?: boolean
}

export type KycContext = {
  readonly now: Date
  readonly route?: KycCompletionRoute
  /**
   * The KYC file as derived from the document ledger.
   *
   * This replaced a pair of caller-supplied lists — `requiredDocuments` and
   * `presentDocuments` — which the guard compared against each other. That guard
   * read well and checked nothing: it asked whether the caller's own claim was
   * internally consistent, never whether the documents existed, so a caller
   * passing two empty arrays walked to `complete` with an empty file. Only the
   * layer that owns the ledger can fill this in, which is the point.
   */
  readonly derived?: DerivedCustomerState
  /** Values pulled off documents in this session. */
  readonly extractedFields?: readonly ExtractedField[]
  /** What the record will actually store for Aadhaar. Last four digits, or nothing. */
  readonly aadhaarLast4?: string
  /** Set when a caller tries to persist the whole number. Always refused. */
  readonly aadhaarFull?: string
}

export type ConsentLink = {
  readonly token: string
  readonly expiresAt: string
  /** Must stay false. A consent page is login-free and carries no session. */
  readonly carriesSession: boolean
  /** Must stay false. The link authorises one form, not an account. */
  readonly grantsPortalAccess: boolean
}

export type ConsentContext = {
  readonly now: Date
  readonly link?: ConsentLink
}

const AADHAAR_DIGIT_RUN = /\d(?:[\s-]?\d){11}/

/** A full Aadhaar anywhere in a string, spaced or hyphenated as documents print it. */
export function containsFullAadhaar(value: string): boolean {
  return AADHAAR_DIGIT_RUN.test(value)
}

/**
 * §9: "Aadhaar is masked to last-4 on extraction." Not on display, not on export
 * — on extraction, so the full number never reaches storage in the first place.
 */
export function maskAadhaarToLast4(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 4) {
    throw new RangeError('An Aadhaar number needs at least four digits to mask.')
  }
  return digits.slice(-4)
}

export function aadhaarMaskedToLast4(ctx: KycContext): TransitionResult {
  if (ctx.aadhaarFull !== undefined) {
    return refuse(
      'The full Aadhaar number cannot be stored. Masking happens at extraction and the record keeps the last four digits only.',
    )
  }
  if (ctx.aadhaarLast4 !== undefined && !/^\d{4}$/.test(ctx.aadhaarLast4)) {
    return refuse('The stored Aadhaar value must be exactly the last four digits.')
  }

  const leaking = (ctx.extractedFields ?? []).filter((field) => containsFullAadhaar(field.value))
  if (leaking.length > 0) {
    const names = leaking.map((field) => field.name).join(', ')
    return refuse(
      `These extracted fields still hold a full Aadhaar number: ${names}. Mask to the last four digits before the record is saved.`,
    )
  }
  return allow()
}

/** OCR never silent-commits: an unconfirmed extraction blocks the record. */
export function everyExtractionConfirmed(ctx: KycContext): TransitionResult {
  const unconfirmed = (ctx.extractedFields ?? []).filter((field) => field.confirmed !== true)
  if (unconfirmed.length > 0) {
    const names = unconfirmed.map((field) => field.name).join(', ')
    return refuse(`Confirm the extracted values before saving: ${names}.`)
  }
  return allow()
}

/**
 * §9's completion bar, read off the ledger rather than off the caller.
 *
 * Every refusal names the specific thing standing in the way, because a person
 * being told "not complete" has to know what to go and collect.
 */
export function everyRequiredDocumentPresent(ctx: KycContext): TransitionResult {
  const derived = ctx.derived
  if (!derived) {
    return refuse(
      'The KYC file could not be read. Completion is decided from the documents on file, so a caller cannot assert it.',
    )
  }

  if (derived.blockers.includes(KYC_BLOCKERS.noChecklist)) {
    return refuse(
      'No document checklist is configured for this product, so there is nothing to check the file against. Configure one before completing KYC.',
    )
  }
  if (derived.outstanding.length > 0) {
    return refuse(`KYC is not complete yet. Still missing: ${derived.outstanding.join(', ')}.`)
  }
  if (derived.rejected.length > 0) {
    return refuse(
      `These were rejected on review and a fresh copy is needed: ${derived.rejected.join(', ')}.`,
    )
  }
  return allow()
}

/**
 * Builds the consent link. The token is supplied rather than generated here so
 * fixtures stay deterministic (§8) and so this module holds no randomness.
 */
export function issueConsentLink(token: string, expiresAt: Date): ConsentLink {
  return { token, expiresAt: expiresAt.toISOString(), carriesSession: false, grantsPortalAccess: false }
}

/** §9: "The consent link is tokenised, expiring, login-free, and carries no session." */
export function consentLinkIsTokenisedAndExpiring(ctx: ConsentContext): TransitionResult {
  const link = ctx.link
  if (!link) return refuse('No consent link has been prepared.')

  if (!link.token || link.token.trim().length < 16) {
    return refuse('A consent link needs a long unguessable token. A short or empty token is not a link, it is an invitation.')
  }
  if (!link.expiresAt) {
    return refuse('A consent link must expire. A link that never expires is a permanent open door into a customer record.')
  }
  if (new Date(link.expiresAt) <= ctx.now) {
    return refuse('This consent link has already expired. Issue a fresh one.')
  }
  return allow()
}

export function consentLinkCarriesNoSession(ctx: ConsentContext): TransitionResult {
  const link = ctx.link
  if (!link) return refuse('No consent link has been prepared.')

  if (link.carriesSession) {
    return refuse('A consent link carries no session. The customer fills one form; they are not logged in.')
  }
  if (link.grantsPortalAccess) {
    return refuse('A consent link grants access to one form only, never to the customer portal.')
  }
  return allow()
}

export function consentLinkNotExpired(ctx: ConsentContext): TransitionResult {
  const link = ctx.link
  if (!link) return refuse('No consent link has been prepared.')
  if (new Date(link.expiresAt) <= ctx.now) {
    return refuse(`This consent link expired on ${link.expiresAt}. Issue a fresh one before the customer can submit.`)
  }
  return allow()
}

export function consentLinkExpired(ctx: ConsentContext): TransitionResult {
  const link = ctx.link
  if (!link) return refuse('No consent link has been prepared.')
  if (new Date(link.expiresAt) > ctx.now) {
    return refuse('This consent link is still live, so it cannot be marked expired.')
  }
  return allow()
}

const COMPLETION_GUARDS = [everyRequiredDocumentPresent, everyExtractionConfirmed, aadhaarMaskedToLast4]

/**
 * §9: "Completion fires the credentials recipe automatically - not a manual
 * step." `alsoEmits` is how that promise is kept: the credentials event is part
 * of the same transition, so there is no path to complete that skips it.
 */
export const KYC_TRANSITIONS = {
  pending: {
    partial: { event: 'kyc.partial', guards: [aadhaarMaskedToLast4] },
    complete: {
      event: 'kyc.completed',
      alsoEmits: ['credentials.generated', 'message.sent'],
      guards: COMPLETION_GUARDS,
      note: 'Everything arrived in one sitting.',
    },
  },
  partial: {
    complete: {
      event: 'kyc.completed',
      alsoEmits: ['credentials.generated', 'message.sent'],
      guards: COMPLETION_GUARDS,
      note: '§9: staff completes, or the consent link comes back filled. Same state, same recipe.',
    },
  },
} as const satisfies TransitionTable<KycConsentState, KycContext>

export const kycMachine = createMachine<KycConsentState, KycContext>({
  name: 'kyc',
  states: Object.values(KYC_CONSENT_STATES),
  initial: KYC_CONSENT_STATES.pending,
  transitions: KYC_TRANSITIONS,
})

export const CONSENT_TRANSITIONS = {
  not_sent: {
    link_issued: {
      event: 'consent.link_issued',
      alsoEmits: ['message.sent'],
      guards: [consentLinkIsTokenisedAndExpiring, consentLinkCarriesNoSession],
    },
  },
  link_issued: {
    submitted: { event: 'consent.submitted', guards: [consentLinkNotExpired] },
    expired: { event: 'consent.expired', guards: [consentLinkExpired] },
  },
} as const satisfies TransitionTable<ConsentState, ConsentContext>

export const consentMachine = createMachine<ConsentState, ConsentContext>({
  name: 'consent',
  states: Object.values(CONSENT_STATES),
  initial: CONSENT_STATES.notSent,
  transitions: CONSENT_TRANSITIONS,
})
