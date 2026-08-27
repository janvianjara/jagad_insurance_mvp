/**
 * The consent link's token and its window.
 *
 * §9 asks for three properties and the domain guards check all three
 * (`consentLinkIsTokenisedAndExpiring`, `consentLinkCarriesNoSession`): a long
 * unguessable token, an expiry, and no session. This module produces the first
 * two; the third is structural — `issueConsentLink` in the domain builds the
 * link with `carriesSession: false` and there is no argument that changes it.
 *
 * The token comes from the platform's CSPRNG, never from the fixture PRNG. The
 * fixtures make the same point in a comment on Rakesh's seeded token: a value
 * that gates access to a customer record must not come from a seeded generator,
 * because a seeded generator is reproducible by anyone who knows the seed.
 */

/** Sixteen bytes, hex encoded: 32 characters, well past the guard's floor of 16. */
const TOKEN_BYTES = 16

/**
 * How long a link stays open. Seven days is the fixture's own window (Rakesh's
 * link was issued two days ago and expires in five), and it becomes a parameter
 * of the consent recipe when automation configuration lands in P1 — at which
 * point this constant is read from the recipe rather than replaced by another
 * constant.
 */
export const CONSENT_LINK_VALID_DAYS = 7

const DAY_MS = 86_400_000

export function newConsentToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  globalThis.crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `cns-${hex}`
}

export function consentExpiryFrom(now: Date, days: number = CONSENT_LINK_VALID_DAYS): Date {
  return new Date(now.getTime() + days * DAY_MS)
}

/** A link the clock has passed, whatever the record still says its state is. */
export function isTokenExpired(expiresAt: string, now: Date): boolean {
  return new Date(expiresAt).getTime() <= now.getTime()
}
