import { Link } from 'react-router'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { CountChip, StatusStripe } from '../../ui/signal'
import type { Severity } from '../../ui/signal'
import styles from './NotificationRail.module.css'

/**
 * The mirror of the Assistant's proactive notices, on a queue screen — §3's
 * "and also mirror into a `NotificationRail` on every queue screen so they are
 * not missed by someone who navigated straight past the Assistant".
 *
 * It is presentational on purpose. The rules, the thresholds and the dismissals
 * live in `src/features/assistant`; this component knows only how to draw a
 * notice, which is what lets a queue screen mount it without importing the
 * Assistant's data boundary. `<WorkQueue>` already offers the slot: its
 * `children` are documented as "anything that belongs above the table: a
 * notification rail, pinned stats".
 *
 * Two rules of the design system carry the whole meaning of the surface.
 *
 * Lime is attention — something needs a person and is not an error — and that is
 * exactly what a proactive notice is, so the rail is drawn in `--attn` and the
 * per-notice stripe carries the rule's own severity.
 *
 * The reason line is rendered always, never behind a disclosure. FR-22.8 says
 * every notice carries the reason it was raised; a reason a person has to click
 * for is a reason most people never read.
 */

export type RailNotice = {
  readonly id: string
  readonly severity: Severity
  /** What happened, in one sentence. */
  readonly headline: string
  /** Why it fired. Required — a notice without one does not belong on screen. */
  readonly reason: string
  /** How many records matched. */
  readonly count?: number
  /** The queue that holds the work. */
  readonly to?: string
  readonly toLabel?: string
}

export type NotificationRailProps = {
  notices: readonly RailNotice[]
  /** Omit to render the rail without dismiss controls. */
  onDismiss?: (id: string) => void
  /** Accessible name for the region. */
  label?: string
  /** The "noticed just now" line above the list. */
  caption?: string
}

export function NotificationRail({
  notices,
  onDismiss,
  label = 'Assistant notices',
  caption = 'Assistant · noticed just now',
}: NotificationRailProps) {
  if (notices.length === 0) return null

  return (
    <aside className={styles.rail} aria-label={label}>
      <p className={styles.caption}>
        <Icon name="spark" size="sm" />
        <span>{caption}</span>
      </p>

      <ul className={styles.list}>
        {notices.map((notice) => (
          <li key={notice.id} className={styles.notice}>
            <StatusStripe severity={notice.severity} />
            <div className={styles.body}>
              <p className={styles.headline}>
                <span>{notice.headline}</span>
                {notice.count !== undefined && notice.count > 1 ? (
                  <CountChip count={notice.count} tone="attn" label="records" />
                ) : null}
              </p>
              <p className={styles.reason}>{notice.reason}</p>
              {notice.to ? (
                <Link to={notice.to} className={styles.link}>
                  {notice.toLabel ?? 'Open the queue'}
                </Link>
              ) : null}
            </div>
            {onDismiss ? (
              <Button
                variant="quiet"
                size="sm"
                icon="close"
                label={`Dismiss: ${notice.headline}`}
                onClick={() => onDismiss(notice.id)}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  )
}
