import { format, formatDistanceStrict } from 'date-fns'
import { DATE_FORMATS, readDate } from './date-format'
import { cx } from './cx'
import styles from './RelativeTime.module.css'

export type RelativeTimeProps = {
  value: Date | string | number | null | undefined
  /**
   * The reference moment. Injectable so a render is deterministic in tests and
   * so a whole screen can share one clock reading rather than drifting per row.
   */
  now?: Date
  /** Adds "ago" / "in", which is what makes past and future distinguishable. */
  addSuffix?: boolean
  absentText?: string
  className?: string
}

/** "3 days ago", "in 6 hours" — with the exact timestamp on hover. */
export function RelativeTime({
  value,
  now,
  addSuffix = true,
  absentText = 'never',
  className,
}: RelativeTimeProps) {
  const date = readDate(value)

  if (!date) {
    return <span className={cx(styles.absent, className)}>{absentText}</span>
  }

  return (
    <time
      className={cx(styles.relative, className)}
      dateTime={date.toISOString()}
      title={format(date, DATE_FORMATS.datetime)}
    >
      {formatDistanceStrict(date, now ?? new Date(), { addSuffix })}
    </time>
  )
}
