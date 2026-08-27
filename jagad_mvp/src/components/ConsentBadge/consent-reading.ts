/**
 * How a consent link reads on a screen.
 *
 * §9 gives the link four states and three properties: tokenised, expiring, and
 * carrying no session. The first two are visible facts a back-office user acts
 * on — a link that is out and unanswered is chased, one that has expired is
 * reissued — so the reading below is a function of the state AND the clock, not
 * of the state alone. A record still marked `link_issued` whose expiry has
 * passed reads as expired here, because that is what it is; the machine's own
 * move to `expired` is a separate act with an event behind it.
 */

import { CONSENT_STATES } from '../../domain/workflows'
import type { ConsentState } from '../../domain/workflows'
import type { Tone } from '../../ui/tone'

export type ConsentReading = {
  readonly label: string
  readonly tone: Tone
  /** True when the link is out, unanswered and still inside its window. */
  readonly live: boolean
  /** True when the window has closed with nothing submitted. */
  readonly lapsed: boolean
  /** One line under the pill: what happens next, or what to do. */
  readonly note: string
}

const DAY_MS = 86_400_000

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS)
}

export function readConsent(
  state: ConsentState,
  options: { readonly now: Date; readonly expiresAt?: string | null; readonly submittedAt?: string | null },
): ConsentReading {
  const { now, expiresAt, submittedAt } = options
  const expiry = expiresAt ? new Date(expiresAt) : null
  const past = expiry !== null && expiry.getTime() <= now.getTime()

  if (state === CONSENT_STATES.submitted) {
    return {
      label: 'Consent recorded',
      tone: 'ok',
      live: false,
      lapsed: false,
      note: submittedAt
        ? 'The customer filled the link themselves; the record carries what they gave and when.'
        : 'Consent is on the record.',
    }
  }

  if (state === CONSENT_STATES.expired || (state === CONSENT_STATES.linkIssued && past)) {
    return {
      label: 'Link expired',
      tone: 'idle',
      live: false,
      lapsed: true,
      note: 'The window closed with nothing submitted. Issue a fresh link; the old token stops working the moment it is replaced.',
    }
  }

  if (state === CONSENT_STATES.linkIssued && expiry !== null) {
    const days = Math.max(0, daysBetween(now, expiry))
    return {
      label: 'Link sent, awaiting the customer',
      tone: 'attn',
      live: true,
      lapsed: false,
      note: `The customer has ${days} ${days === 1 ? 'day' : 'days'} left to open it. The link is login-free and carries no session.`,
    }
  }

  if (state === CONSENT_STATES.linkIssued) {
    return {
      label: 'Link sent, awaiting the customer',
      tone: 'attn',
      live: true,
      lapsed: false,
      note: 'The link is login-free and carries no session.',
    }
  }

  return {
    label: 'No consent link sent',
    tone: 'warn',
    live: false,
    lapsed: false,
    note: 'KYC cannot complete on the consent route until the customer has been sent a link and has filled it.',
  }
}
