/**
 * The tokenised document upload link — FR-11.1, FR-16.8, D21, plan §11.1.
 *
 * §5's page inventory carries `/upload/:token` as "the same mechanic for a
 * cashless claim's discharge summary. One tap from the link", and §11.1 puts it
 * beside `/consent/:token` as a route that carries no session by design. This
 * module is the rule half of that: what a link is, when it stops working, and
 * what it may never be used to collect.
 *
 * It is modelled on `issueConsentLink` deliberately, down to the token being
 * supplied rather than generated here — fixtures stay deterministic (§8) and the
 * domain holds no randomness.
 *
 * Two things this module does NOT do, because they belong to the layer above:
 *
 *   - it never names a `DocumentType`. That union lives in `src/data/repo`, and
 *     the layer rule runs domain → data, never back. `docTypes` is therefore a
 *     list of strings here and is narrowed at the desk, which is the only place
 *     that knows both vocabularies.
 *   - it never decides what a refused link should LOOK like. An unknown token
 *     and an expired one must be indistinguishable to whoever is holding it, and
 *     that is a rendering promise the desk and the screen keep together.
 */

import { allow, refuse } from './machine'
import type { TransitionResult } from './machine'

/**
 * The shape of a link, sized for the moment it is used: somebody standing at a
 * discharge desk with one hand free. Short-lived, capped, and countable.
 */
export const UPLOAD_LINK_LIMITS = {
  /** Long enough to collect a discharge summary, short enough to be useless later. */
  lifetimeDays: 7,
  /** A discharge summary is a page or three. Ten covers a re-shoot, not a library. */
  maxUploads: 10,
  /** Every open counts, valid or not. The cap is what makes the token unguessable in practice. */
  maxAttempts: 40,
} as const

/**
 * Document types a claim upload link may never accept.
 *
 * The constitution's Aadhaar rule is absolute — last-4 maximum in staff UI, never
 * the full number anywhere — and an identity document photographed at a hospital
 * desk is the full number. KYC has its own consented surface at `/consent/:token`
 * with a four-character field and nowhere to put the other eight digits; this
 * link is for a claim, and a claim needs no proof of who somebody is.
 */
export const UPLOAD_FORBIDDEN_DOC_TYPES: readonly string[] = ['aadhaar', 'pan', 'photo']

export type UploadLink = {
  readonly token: string
  /** The claim this link collects for. One link, one claim, never a customer-wide door. */
  readonly claimId: string
  /** Exactly what this link will accept. A closed list, checked on every offer. */
  readonly docTypes: readonly string[]
  readonly issuedAt: string
  readonly expiresAt: string
  readonly maxUploads: number
  readonly usedUploads: number
  readonly maxAttempts: number
  /** Every open of the link, accepted or refused. */
  readonly attempts: number
  /** Set when the desk withdraws the link before it expires. */
  readonly revokedAt: string | null
  /** Must stay false. An upload page is login-free and carries no session. */
  readonly carriesSession: boolean
  /** Must stay false. The link authorises one drop-off, not an account. */
  readonly grantsPortalAccess: boolean
}

export type UploadContext = {
  readonly now: Date
  readonly link?: UploadLink
  /** The type being offered, when something is being offered. */
  readonly offeredDocType?: string
}

/* -------------------------------------------------------------------- issuing */

export type IssueUploadLinkInput = {
  readonly token: string
  readonly claimId: string
  readonly docTypes: readonly string[]
  readonly issuedAt: Date
  readonly expiresAt: Date
  readonly maxUploads?: number
  readonly maxAttempts?: number
}

/**
 * Builds a link. The token is supplied, not generated: see the module note.
 *
 * Nothing here validates — `uploadLinkIsIssuable` does, and it is called before
 * this so that a refused issue produces no link at all rather than a bad one.
 */
export function issueUploadLink(input: IssueUploadLinkInput): UploadLink {
  return {
    token: input.token,
    claimId: input.claimId,
    docTypes: [...input.docTypes],
    issuedAt: input.issuedAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    maxUploads: input.maxUploads ?? UPLOAD_LINK_LIMITS.maxUploads,
    usedUploads: 0,
    maxAttempts: input.maxAttempts ?? UPLOAD_LINK_LIMITS.maxAttempts,
    attempts: 0,
    revokedAt: null,
    carriesSession: false,
    grantsPortalAccess: false,
  }
}

/** When a link issued now should close. */
export function uploadLinkExpiryFrom(now: Date, days: number = UPLOAD_LINK_LIMITS.lifetimeDays): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}

/**
 * Checked before a token is drawn, so a refused issue consumes nothing — the
 * same posture `claimDesk.intimate` takes with the claim sequence.
 */
export function uploadLinkIsIssuable(input: IssueUploadLinkInput): TransitionResult {
  if (!input.token || input.token.trim().length < 16) {
    return refuse(
      'An upload link needs a long unguessable token. A short or empty token is not a link, it is an invitation.',
    )
  }
  if (input.docTypes.length === 0) {
    return refuse(
      'An upload link must say what it accepts. A link that accepts anything is a link nobody can review.',
    )
  }
  const forbidden = input.docTypes.filter((type) => UPLOAD_FORBIDDEN_DOC_TYPES.includes(type))
  if (forbidden.length > 0) {
    return refuse(
      `A claim upload link cannot ask for ${forbidden.join(', ')}. Identity documents are collected on the consent link, which stores four digits of Aadhaar and never the whole number.`,
    )
  }
  if (input.expiresAt <= input.issuedAt) {
    return refuse(
      'An upload link must expire after it is issued. A link that never closes is a permanent open door into a claim.',
    )
  }
  return allow()
}

/* --------------------------------------------------------------------- guards */

export function uploadLinkIsTokenisedAndExpiring(ctx: UploadContext): TransitionResult {
  const link = ctx.link
  if (!link) return refuse('No upload link has been prepared.')

  if (!link.token || link.token.trim().length < 16) {
    return refuse(
      'An upload link needs a long unguessable token. A short or empty token is not a link, it is an invitation.',
    )
  }
  if (!link.expiresAt) {
    return refuse(
      'An upload link must expire. A link that never expires is a permanent open door into a claim.',
    )
  }
  return allow()
}

export function uploadLinkCarriesNoSession(ctx: UploadContext): TransitionResult {
  const link = ctx.link
  if (!link) return refuse('No upload link has been prepared.')

  if (link.carriesSession) {
    return refuse('An upload link carries no session. The customer drops off a document; they are not logged in.')
  }
  if (link.grantsPortalAccess) {
    return refuse('An upload link grants one drop-off only, never access to the customer portal.')
  }
  return allow()
}

export function uploadLinkNotRevoked(ctx: UploadContext): TransitionResult {
  const link = ctx.link
  if (!link) return refuse('No upload link has been prepared.')
  if (link.revokedAt !== null) {
    return refuse('This upload link was withdrawn by the claims desk. Ask them for a fresh one.')
  }
  return allow()
}

export function uploadLinkNotExpired(ctx: UploadContext): TransitionResult {
  const link = ctx.link
  if (!link) return refuse('No upload link has been prepared.')
  if (new Date(link.expiresAt) <= ctx.now) {
    return refuse(`This upload link closed on ${link.expiresAt}. Issue a fresh one before anything else can be sent.`)
  }
  return allow()
}

export function uploadLinkHasCapacity(ctx: UploadContext): TransitionResult {
  const link = ctx.link
  if (!link) return refuse('No upload link has been prepared.')
  if (link.usedUploads >= link.maxUploads) {
    return refuse(
      `This link has already taken ${link.usedUploads} documents, which is all it will hold. The claims desk can issue another.`,
    )
  }
  return allow()
}

/**
 * The rate limit. It counts opens rather than uploads, because guessing a token
 * costs an open and nothing else.
 *
 * The refusal says the link is busy rather than that it is blocked: somebody
 * holding a real link needs to know to come back, and somebody holding a guessed
 * one should learn nothing at all.
 */
export function uploadLinkWithinAttemptLimit(ctx: UploadContext): TransitionResult {
  const link = ctx.link
  if (!link) return refuse('No upload link has been prepared.')
  if (link.attempts >= link.maxAttempts) {
    return refuse('This link has been opened too many times in a short while. Please try again shortly.')
  }
  return allow()
}

export function uploadTypeIsAccepted(ctx: UploadContext): TransitionResult {
  const link = ctx.link
  if (!link) return refuse('No upload link has been prepared.')

  const offered = ctx.offeredDocType
  if (offered === undefined || offered.trim() === '') {
    return refuse('Say which document this is before sending it.')
  }
  if (UPLOAD_FORBIDDEN_DOC_TYPES.includes(offered)) {
    return refuse(
      'Identity documents are not collected here. Nothing has been sent, and nothing has been kept.',
    )
  }
  if (!link.docTypes.includes(offered)) {
    return refuse(`This link is not collecting that. It is open for: ${link.docTypes.join(', ')}.`)
  }
  return allow()
}

/** Every reason a link might be closed, asked in the order a person would ask them. */
const OPEN_GUARDS: readonly ((ctx: UploadContext) => TransitionResult)[] = [
  uploadLinkIsTokenisedAndExpiring,
  uploadLinkCarriesNoSession,
  uploadLinkNotRevoked,
  uploadLinkNotExpired,
  uploadLinkWithinAttemptLimit,
]

/** Whether the page may be shown at all. */
export function uploadLinkIsOpen(ctx: UploadContext): TransitionResult {
  for (const guard of OPEN_GUARDS) {
    const verdict = guard(ctx)
    if (!verdict.ok) return verdict
  }
  return allow()
}

/** Whether this particular document may be taken. */
export function uploadIsAcceptable(ctx: UploadContext): TransitionResult {
  const open = uploadLinkIsOpen(ctx)
  if (!open.ok) return open

  const capacity = uploadLinkHasCapacity(ctx)
  if (!capacity.ok) return capacity

  return uploadTypeIsAccepted(ctx)
}

/* --------------------------------------------------------------- transitions */

export function recordUploadAttempt(link: UploadLink): UploadLink {
  return { ...link, attempts: link.attempts + 1 }
}

export function recordUploadAccepted(link: UploadLink): UploadLink {
  return { ...link, usedUploads: link.usedUploads + 1 }
}

export function revokeUploadLink(link: UploadLink, at: Date): UploadLink {
  return { ...link, revokedAt: at.toISOString() }
}
