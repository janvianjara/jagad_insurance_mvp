import type { ReactNode } from 'react'
import styles from './ActionBar.module.css'

export type ActionBarProps = {
  /** Filters, search, view switches — the controls that narrow what is shown. */
  children?: ReactNode
  /** Actions that act on what is shown. Right-aligned. */
  end?: ReactNode
  /** Accessible name, since this is a landmark on a screen that has several. */
  label?: string
  sticky?: boolean
}

/**
 * The strip under the page header: how to narrow the work on the left, what to
 * do about it on the right (§3's FilterBar / BulkActionBar row).
 *
 * A queue rendered by `<WorkQueue>` gets this for free. Screens that are not
 * queues use it directly so their controls sit on the same line at the same
 * height as every other screen's.
 */
export function ActionBar({ children, end, label = 'Screen actions', sticky }: ActionBarProps) {
  return (
    <div
      className={[styles.bar, sticky ? styles.sticky : null].filter(Boolean).join(' ')}
      role="toolbar"
      aria-label={label}
    >
      <div className={styles.start}>{children}</div>
      {end ? <div className={styles.end}>{end}</div> : null}
    </div>
  )
}
