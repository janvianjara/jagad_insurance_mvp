import { Clock } from '../../ui/signal'
import { Icon } from '../../ui/Icon'
import { DateTime } from '../../ui/type'
import { TRAIL_KIND_STYLE } from './trail-entry'
import type { TrailEntry } from './trail-entry'
import tones from '../../ui/tones.module.css'
import styles from './AssignmentTrail.module.css'

export type AssignmentTrailProps = {
  /** Oldest first. The component never re-orders: the caller owns the sequence. */
  entries: readonly TrailEntry[]
  /** Injected so a hold that is still open reads the same in a test and on screen. */
  now: Date
  /** Accessible name for the list. */
  label?: string
  emptyText?: string
  className?: string
}

const MINUTE_MS = 60_000

/**
 * Who has held this record, for how long, and what happened at each handover.
 *
 * §9 asks three things of an inquiry's history and this component is where two
 * of them become visible:
 *
 *   - every event shows, not only the current holder. A trail that renders the
 *     latest assignment and calls it history is how "it sat with three people
 *     for six hours" becomes invisible;
 *   - an escalation renders the whole assignment history it carried, inline,
 *     because the manager who receives one needs the trail and not a link to it.
 *
 * Each hold carries a clock. A closed hold shows how long that person had it; an
 * open one shows the turnaround still running, and only when the caller supplies
 * the allowance — the TAT is a routing-recipe parameter, so a trail with no
 * `tatMinutes` renders the wait and no deadline rather than inventing one.
 */
export function AssignmentTrail({
  entries,
  now,
  label = 'Assignment trail',
  emptyText = 'Nothing has happened to this record yet.',
  className,
}: AssignmentTrailProps) {
  if (entries.length === 0) {
    return (
      <p className={styles.empty} data-assignment-trail="empty">
        {emptyText}
      </p>
    )
  }

  return (
    <ol className={[styles.trail, className].filter(Boolean).join(' ')} aria-label={label}>
      {entries.map((entry) => {
        const style = TRAIL_KIND_STYLE[entry.kind]
        const start = new Date(entry.at)
        const open = entry.until === undefined || entry.until === null
        const heldUntil = open ? now : new Date(entry.until as string)

        return (
          <li
            key={entry.id}
            className={[tones.tone, styles.entry].join(' ')}
            data-tone={style.tone}
            data-kind={entry.kind}
            data-open={open || undefined}
          >
            <span className={styles.marker} aria-hidden="true">
              <Icon name={style.icon} size="sm" />
            </span>

            <div className={styles.body}>
              <p className={styles.title}>
                {entry.title}
                {entry.actorName ? <span className={styles.actor}>{entry.actorName}</span> : null}
              </p>

              <p className={styles.when}>
                <DateTime value={entry.at} mode="datetime" />
                <span className={styles.held}>
                  <Clock mode="aging" start={start} now={heldUntil} showIcon={false} />
                </span>
                {open && entry.tatMinutes !== undefined ? (
                  <Clock
                    mode="tat"
                    start={start}
                    now={now}
                    durationMs={entry.tatMinutes * MINUTE_MS}
                    label="TAT"
                  />
                ) : null}
              </p>

              {entry.detail ? <p className={styles.detail}>{entry.detail}</p> : null}

              {entry.carries && entry.carries.length > 0 ? (
                <div className={styles.carried}>
                  <p className={styles.carriedHead}>
                    Assignment history carried with this escalation
                  </p>
                  <ol className={styles.carriedList} aria-label="Assignment history carried with this escalation">
                    {entry.carries.map((carry) => (
                      <li key={carry.id} className={styles.carriedItem}>
                        <span className={styles.carriedName}>{carry.label}</span>
                        <span className={styles.carriedWhen}>
                          <DateTime value={carry.from} mode="datetime" />
                          {carry.to ? (
                            <>
                              <Icon name="chevron-right" size="sm" />
                              <DateTime value={carry.to} mode="datetime" />
                            </>
                          ) : null}
                        </span>
                        {carry.reason ? (
                          <span className={styles.carriedReason}>{carry.reason}</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
