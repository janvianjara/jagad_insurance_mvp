import { format } from 'date-fns'
import { DATE_FORMATS, readDate } from './date-format'
import type { DateTimeMode } from './date-format'
import { cx } from './cx'
import styles from './DateTime.module.css'

export type DateTimeProps = {
  value: Date | string | number | null | undefined
  mode?: DateTimeMode
  /** What to show when nothing has been recorded. Absence is information. */
  absentText?: string
  className?: string
}

/**
 * A recorded moment. Mono face with tabular figures, because dates are read
 * down a column and a proportional face makes the columns wobble.
 */
export function DateTime({
  value,
  mode = 'date',
  absentText = 'not set',
  className,
}: DateTimeProps) {
  const date = readDate(value)

  if (!date) {
    return <span className={cx(styles.absent, className)}>{absentText}</span>
  }

  return (
    <time className={cx(styles.datetime, className)} dateTime={date.toISOString()}>
      {format(date, DATE_FORMATS[mode])}
    </time>
  )
}
