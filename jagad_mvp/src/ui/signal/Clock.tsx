import { Icon } from '../Icon'
import { readClock } from './clock-reading'
import type { ClockMode } from './clock-reading'
import { cx } from './cx'
import tones from '../tones.module.css'
import styles from './Clock.module.css'

type ClockBase = {
  /** When the clock started: assignment, due date, creation. */
  start: Date | string | number
  /**
   * The reference moment. Injectable so tests are deterministic and so one
   * screen can share a single clock reading instead of drifting row by row.
   */
  now?: Date
  /** Prefix in front of the reading, e.g. "Assigned" or "Renewal". */
  label?: string
  warnFraction?: number
  emphasis?: 'normal' | 'strong'
  showIcon?: boolean
  className?: string
}

/**
 * `durationMs` is required for the two modes that have a deadline and optional
 * for aging, which has none. The union is the enforcement: a turnaround clock
 * cannot be rendered without someone stating the allowance it is measured
 * against, and this file never supplies one.
 */
export type ClockProps =
  | (ClockBase & { mode: Extract<ClockMode, 'tat' | 'grace'>; durationMs: number })
  | (ClockBase & { mode: Extract<ClockMode, 'aging'>; durationMs?: number })

/**
 * Turnaround, grace and aging in one reading: how long is left, or how long it
 * has been, and what that means in the charter's colours.
 */
export function Clock(props: ClockProps) {
  const {
    mode,
    start,
    now,
    label,
    warnFraction,
    emphasis = 'normal',
    showIcon = true,
    className,
  } = props

  const startDate = start instanceof Date ? start : new Date(start)
  const reading = readClock({
    mode,
    start: startDate,
    now: now ?? new Date(),
    durationMs: props.durationMs,
    warnFraction,
  })

  return (
    <span
      className={cx(tones.tone, styles.clock, className)}
      data-tone={reading.tone}
      data-mode={mode}
      data-breached={reading.breached || undefined}
      data-emphasis={emphasis === 'normal' ? undefined : emphasis}
    >
      {showIcon ? <Icon name="clock" size="sm" /> : null}
      {label ? <span className={styles.label}>{label}</span> : null}
      <span className={styles.value}>{reading.text}</span>
    </span>
  )
}
