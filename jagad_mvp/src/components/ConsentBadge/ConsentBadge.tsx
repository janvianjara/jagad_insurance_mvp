import { StatusPill } from '../../ui/signal'
import { DateTime } from '../../ui/type'
import { readConsent } from './consent-reading'
import type { ConsentState } from '../../domain/workflows'
import styles from './ConsentBadge.module.css'

export type ConsentBadgeProps = {
  state: ConsentState
  /** Injected so a badge and the screen around it never disagree about "now". */
  now: Date
  expiresAt?: string | null
  submittedAt?: string | null
  /** Adds the sentence under the pill. Off in a table cell, on in a panel. */
  showNote?: boolean
  className?: string
}

/**
 * Where a customer's consent stands, in one pill.
 *
 * The link is the M0 blocker (§11.1: "KYC cannot complete without it"), so its
 * state belongs on the customer row, the KYC row and the 360 header rather than
 * buried in a tab. Lime while it is out and unanswered — somebody needs to chase
 * it; grey once it has lapsed, because a dead link is not an error, it is a link
 * to reissue.
 */
export function ConsentBadge({
  state,
  now,
  expiresAt,
  submittedAt,
  showNote = false,
  className,
}: ConsentBadgeProps) {
  const reading = readConsent(state, { now, expiresAt: expiresAt ?? null, submittedAt: submittedAt ?? null })

  return (
    <span
      className={[styles.badge, className].filter(Boolean).join(' ')}
      data-consent-state={state}
      data-consent-lapsed={reading.lapsed ? 'true' : undefined}
    >
      <StatusPill tone={reading.tone}>{reading.label}</StatusPill>
      {showNote ? (
        <span className={styles.note}>
          {reading.note}
          {reading.live && expiresAt ? (
            <>
              {' '}
              <span className={styles.expiry}>
                Expires <DateTime value={expiresAt} mode="date" />.
              </span>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  )
}
