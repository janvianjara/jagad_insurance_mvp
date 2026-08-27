import { Icon } from '../../ui/Icon'
import { DateTime } from '../../ui/type'
import { buildTimeline } from './timeline-entry'
import type { TimelineOptions } from './timeline-entry'
import type { DomainEvent } from '../../domain/events'
import tones from '../../ui/tones.module.css'
import styles from './RecordTimeline.module.css'

export type RecordTimelineProps = {
  /** The record's event log, in any order. The component sorts. */
  events: readonly DomainEvent[]
  /** Resolves actor ids to names, groups events into days, adds detail prose. */
  options?: TimelineOptions
  label?: string
  emptyText?: string
  className?: string
}

/**
 * Who did what, when — charter U14, on every record.
 *
 * The timeline is the event log rendered, not a parallel history. That is the
 * property worth defending: a screen cannot show an action without the log
 * having recorded it, and the log cannot record one without the line appearing,
 * because there is only one source and it is the bus every §9 transition emits
 * on. An event this component has no wording for still gets a dated line with an
 * actor on it (see `fallbackReading`), so a new module's events show up here the
 * day they are first emitted rather than the day somebody adds a case.
 *
 * It reads no repository and holds no state. The caller resolves the names.
 */
export function RecordTimeline({
  events,
  options,
  label = 'Record timeline',
  emptyText = 'Nothing has been recorded against this record yet. Every action taken on it from here appears in this list, with who did it and when.',
  className,
}: RecordTimelineProps) {
  const entries = buildTimeline(events, options)

  if (entries.length === 0) {
    return (
      <p className={styles.empty} data-record-timeline="empty">
        {emptyText}
      </p>
    )
  }

  return (
    <ol
      className={[styles.timeline, className].filter(Boolean).join(' ')}
      aria-label={label}
      data-record-timeline="list"
    >
      {entries.map((entry) => (
        <li
          key={entry.id}
          className={[tones.tone, styles.entry].join(' ')}
          data-tone={entry.tone}
          data-event={entry.eventName}
        >
          <span className={styles.marker} aria-hidden="true">
            <Icon name={entry.icon} size="sm" />
          </span>

          <div className={styles.body}>
            <p className={styles.title}>{entry.title}</p>
            <p className={styles.meta}>
              <DateTime value={entry.at} mode="datetime" />
              <span className={styles.actor}>{entry.actorName}</span>
            </p>
            {entry.detail ? <p className={styles.detail}>{entry.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
